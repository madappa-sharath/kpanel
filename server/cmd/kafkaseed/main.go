package main

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"math"
	"math/rand"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/google/uuid"
	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/sasl/plain"
	"github.com/twmb/franz-go/pkg/sasl/scram"
)

var (
	broker        = flag.String("broker", "localhost:9092", "Kafka bootstrap broker")
	count         = flag.Int("count", 0, "messages per topic (default: each topic's own volume when seeding, 50 for --produce and --binary)")
	seed          = flag.Int64("seed", 42, "random seed; the same seed produces the same keys and payloads")
	reset         = flag.Bool("reset", false, "delete seed topics and groups (including ones from older seeds) before seeding")
	ifEmpty       = flag.Bool("if-empty", false, "skip seeding when the dev topics already contain data")
	consume       = flag.Bool("consume", false, "advance consumer group offsets (reduce lag)")
	step          = flag.Int64("step", 5, "messages to advance per partition (consume mode)")
	drain         = flag.Bool("drain", false, "advance all groups to end offset, zeroing lag; implies --consume")
	produce       = flag.Bool("produce", false, "produce more messages to existing topics without re-seeding")
	members       = flag.Bool("members", false, "start real consumers for each group (shows members in UI); runs until Ctrl+C")
	traffic       = flag.Duration("traffic", 0, "produce live traffic and run consumer groups at their configured rates for this long (e.g. 10m)")
	binary_       = flag.Bool("binary", false, "produce binary (non-UTF-8) messages to binary-test topic for UI testing")
	saslMechanism = flag.String("sasl-mechanism", "", "SASL mechanism: plain, scram-sha-256, or scram-sha-512")
	saslUser      = flag.String("sasl-user", "", "SASL username")
	saslPassword  = flag.String("sasl-password", "", "SASL password")
)

// Names used by earlier versions of the seed. --reset deletes them too, so a
// broker seeded by an older checkout ends up with only the current data set.
var legacyTopics = []string{
	"events", "dead-letter", "email-queue", "sms-queue", "push-notifications",
	"analytics-raw", "analytics-aggregated", "data-pipeline-errors", "logs-aggregated",
	"cdc-users", "cdc-products", "binary-test",
}

var legacyGroups = []string{
	"orders-processor", "analytics-pipeline", "notification-service", "reporting-etl",
	"payments-processor", "fraud-detection", "shipping-service", "review-aggregator",
	"session-tracker", "audit-service", "promo-engine", "email-sender", "sms-sender",
	"push-sender", "fraud-analyst", "analytics-consumer", "data-pipeline", "config-watcher",
	"metrics-collector", "cdc-processor", "compliance-monitor", "ops-dashboard",
	"event-archiver", "global-consumer",
}

func main() {
	flag.Parse()

	if *members || *traffic > 0 {
		ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
		defer stop()
		if *traffic > 0 {
			var cancel context.CancelFunc
			ctx, cancel = context.WithTimeout(ctx, *traffic)
			defer cancel()
		}
		var wg sync.WaitGroup
		rate := func(groupDef) float64 { return 1.0 / 15 } // one record per member every 15s
		if *traffic > 0 {
			rate = func(g groupDef) float64 { return g.msgsPerSec / float64(g.members) }
			wg.Add(1)
			go func() { defer wg.Done(); produceTraffic(ctx) }()
		}
		cleanup := startGroupMembers(ctx, &wg, rate)
		<-ctx.Done()
		log.Println("shutting down...")
		wg.Wait()
		cleanup()
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	opts, err := clientOpts(kgo.SeedBrokers(*broker), kgo.ClientID("kafkaseed"))
	if err != nil {
		log.Fatalf("invalid kafka client options: %v", err)
	}
	cl, err := kgo.NewClient(opts...)
	if err != nil {
		log.Fatalf("failed to create kafka client: %v", err)
	}
	defer cl.Close()

	adm := kadm.NewClient(cl)

	if *binary_ {
		produceBinaryMessages(ctx, cl, adm)
		log.Println("done")
		return
	}

	if *drain {
		*consume = true
	}

	if *consume {
		advanceGroupOffsets(ctx, adm)
		log.Println("done")
		return
	}

	if *produce {
		produceMessages(ctx, cl, func(topicDef) int { return countOr(50) }, false)
		log.Println("done")
		return
	}

	if *reset {
		deleteGroups(ctx, adm)
		deleteTopics(ctx, adm)
	}

	if *ifEmpty && hasSeedData(ctx, adm) {
		log.Println("dev topics already contain data; skipping seed")
		return
	}

	createTopics(ctx, adm)
	produceMessages(ctx, cl, func(td topicDef) int { return countOr(td.messages) }, true)
	commitGroupOffsets(ctx, adm)

	log.Println("done")
}

func countOr(def int) int {
	if *count > 0 {
		return *count
	}
	return def
}

func clientOpts(opts ...kgo.Opt) ([]kgo.Opt, error) {
	switch *saslMechanism {
	case "":
		return opts, nil
	case "plain":
		opts = append(opts, kgo.SASL(plain.Auth{User: *saslUser, Pass: *saslPassword}.AsMechanism()))
	case "scram-sha-256":
		opts = append(opts, kgo.SASL(scram.Auth{User: *saslUser, Pass: *saslPassword}.AsSha256Mechanism()))
	case "scram-sha-512":
		opts = append(opts, kgo.SASL(scram.Auth{User: *saslUser, Pass: *saslPassword}.AsSha512Mechanism()))
	default:
		return nil, fmt.Errorf("unknown SASL mechanism %q", *saslMechanism)
	}
	if *saslUser == "" {
		return nil, fmt.Errorf("SASL username is required")
	}
	return opts, nil
}

// hasSeedData checks a topic only the current seed creates, so a broker
// seeded by an older version is seeded again rather than skipped.
func hasSeedData(ctx context.Context, adm *kadm.Client) bool {
	const marker = "user-events"
	offsets, err := adm.ListEndOffsets(ctx, marker)
	if err != nil {
		return false
	}
	for _, partition := range offsets[marker] {
		if partition.Offset > 0 {
			return true
		}
	}
	return false
}

func topicNames() []string {
	names := make([]string, len(topics))
	for i, t := range topics {
		names[i] = t.name
	}
	return names
}

// startGroupMembers joins each group with its configured number of members.
// Each member consumes at rate(g) records per second and commits through
// kgo's autocommit, so lag moves the way it would with a real service.
func startGroupMembers(ctx context.Context, wg *sync.WaitGroup, rate func(groupDef) float64) func() {
	var clients []*kgo.Client

	for _, g := range groups {
		perSec := rate(g)
		for i := 0; i < g.members; i++ {
			clientID := fmt.Sprintf("%s-%d", g.name, i)
			opts, err := clientOpts(
				kgo.SeedBrokers(*broker),
				kgo.ClientID(clientID),
				kgo.ConsumerGroup(g.name),
				kgo.ConsumeTopics(g.topics...),
				kgo.AutoCommitInterval(2*time.Second),
			)
			if err != nil {
				log.Printf("failed to build consumer %s options: %v", clientID, err)
				continue
			}
			cl, err := kgo.NewClient(opts...)
			if err != nil {
				log.Printf("failed to create consumer %s: %v", clientID, err)
				continue
			}
			clients = append(clients, cl)
			wg.Add(1)
			go func(cl *kgo.Client, id string) {
				defer wg.Done()
				batch := int(math.Max(1, math.Ceil(perSec/2)))
				for {
					fetches := cl.PollRecords(ctx, batch)
					if fetches.IsClientClosed() || ctx.Err() != nil {
						return
					}
					fetches.EachError(func(t string, p int32, err error) {
						log.Printf("fetch error [%s] topic=%s partition=%d: %v", id, t, p, err)
					})
					wait := time.Duration(float64(fetches.NumRecords()) / perSec * float64(time.Second))
					select {
					case <-ctx.Done():
						return
					case <-time.After(wait):
					}
				}
			}(cl, clientID)
		}
		if g.members > 0 {
			log.Printf("started %d consumers for group %s", g.members, g.name)
		}
	}

	return func() {
		for _, cl := range clients {
			cl.Close()
		}
	}
}

// produceTraffic produces to each topic with a msgsPerSec until ctx ends.
func produceTraffic(ctx context.Context) {
	opts, err := clientOpts(kgo.SeedBrokers(*broker), kgo.ClientID("kafkaseed-traffic"))
	if err != nil {
		log.Printf("traffic: %v", err)
		return
	}
	cl, err := kgo.NewClient(opts...)
	if err != nil {
		log.Printf("traffic: %v", err)
		return
	}
	defer cl.Close()

	r := rand.New(rand.NewSource(*seed + 1))
	const tick = 250 * time.Millisecond
	owed := map[string]float64{}
	ticker := time.NewTicker(tick)
	defer ticker.Stop()
	log.Println("producing live traffic")
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
		for _, td := range topics {
			if td.msgsPerSec == 0 {
				continue
			}
			// Vary the rate a little so the charts are not flat lines.
			owed[td.name] += td.msgsPerSec * tick.Seconds() * (0.7 + 0.6*r.Float64())
			for ; owed[td.name] >= 1; owed[td.name]-- {
				m := td.gen(r)
				cl.Produce(ctx, record(td.name, m, time.Time{}), func(_ *kgo.Record, err error) {
					if err != nil && ctx.Err() == nil {
						log.Printf("traffic produce: %v", err)
					}
				})
			}
		}
	}
}

func record(topic string, m message, ts time.Time) *kgo.Record {
	rec := &kgo.Record{Topic: topic, Key: []byte(m.key), Value: encode(m), Timestamp: ts}
	for k, v := range m.headers {
		rec.Headers = append(rec.Headers, kgo.RecordHeader{Key: k, Value: []byte(v)})
	}
	// Map iteration order is random; sort so reruns produce identical records.
	sortHeaders(rec.Headers)
	return rec
}

func sortHeaders(h []kgo.RecordHeader) {
	for i := 1; i < len(h); i++ {
		for j := i; j > 0 && h[j].Key < h[j-1].Key; j-- {
			h[j], h[j-1] = h[j-1], h[j]
		}
	}
}

func deleteGroups(ctx context.Context, adm *kadm.Client) {
	names := append([]string{}, legacyGroups...)
	for _, g := range groups {
		names = append(names, g.name)
	}
	resp, err := adm.DeleteGroups(ctx, names...)
	if err != nil {
		log.Printf("delete groups request error: %v", err)
		return
	}
	for _, r := range resp {
		if r.Err != nil && r.Err != kerr.GroupIDNotFound {
			log.Printf("  delete group %s: %v", r.Group, r.Err)
		}
	}
}

func deleteTopics(ctx context.Context, adm *kadm.Client) {
	names := append(topicNames(), legacyTopics...)
	resp, err := adm.DeleteTopics(ctx, names...)
	if err != nil {
		log.Printf("delete topics request error: %v", err)
		return
	}
	for _, r := range resp {
		if r.Err == kerr.UnknownTopicOrPartition {
			continue
		}
		if r.Err != nil {
			log.Printf("  delete %s: %v", r.Topic, r.Err)
		} else {
			log.Printf("  deleted topic %s", r.Topic)
		}
	}
	// Wait until the deletions finish, or creating the same names fails.
	// Missing topics come back as entries with an error, so count only the
	// ones that still exist.
	var remaining []string
	for i := 0; i < 50; i++ {
		md, err := adm.ListTopics(ctx, names...)
		if err == nil {
			remaining = remaining[:0]
			for _, d := range md {
				if d.Err == nil {
					remaining = append(remaining, d.Topic)
				}
			}
			if len(remaining) == 0 {
				return
			}
		}
		time.Sleep(200 * time.Millisecond)
	}
	log.Fatalf("topics still exist after delete: %v", remaining)
}

func createTopics(ctx context.Context, adm *kadm.Client) {
	for _, td := range topics {
		resp, err := adm.CreateTopics(ctx, td.partitions, 1, td.configs, td.name)
		if err != nil {
			log.Fatalf("create topic %s: %v", td.name, err)
		}
		for _, r := range resp {
			if r.Err == kerr.TopicAlreadyExists {
				log.Printf("  topic %s already exists, skipping", r.Topic)
			} else if r.Err != nil {
				log.Fatalf("  create topic %s: %v", r.Topic, r.Err)
			} else {
				log.Printf("  created topic %s (%d partitions)", r.Topic, td.partitions)
			}
		}
	}
}

// produceMessages produces n(td) records to every topic. With backdate, the
// records are spread over the last two hours instead of all stamped now.
func produceMessages(ctx context.Context, cl *kgo.Client, n func(topicDef) int, backdate bool) {
	r := rand.New(rand.NewSource(*seed))
	now := time.Now()
	for _, td := range topics {
		total := n(td)
		records := make([]*kgo.Record, total)
		for i := range records {
			var ts time.Time
			if backdate {
				ts = timestampFor(now, i, total, 2*time.Hour, r)
			}
			records[i] = record(td.name, td.gen(r), ts)
		}
		if err := cl.ProduceSync(ctx, records...).FirstErr(); err != nil {
			log.Fatalf("produce to %s: %v", td.name, err)
		}
		log.Printf("  produced %d messages to %s", total, td.name)
	}
}

// commitGroupOffsets commits each group's offsets behind the end of each
// partition by its lag, jittered so partitions don't all show the same number.
func commitGroupOffsets(ctx context.Context, adm *kadm.Client) {
	r := rand.New(rand.NewSource(*seed + 2))
	endOffsets, err := adm.ListEndOffsets(ctx, topicNames()...)
	if err != nil {
		log.Fatalf("list end offsets: %v", err)
	}

	for _, gd := range groups {
		var offsets kadm.Offsets
		for _, topic := range gd.topics {
			partOffsets, ok := endOffsets[topic]
			if !ok {
				continue
			}
			// In partition order, so the same seed gives the same lag.
			for p := int32(0); p < int32(len(partOffsets)); p++ {
				lo := partOffsets[p]
				lag := int64(float64(gd.lag) * (0.4 + 1.2*r.Float64()))
				offsets.AddOffset(topic, p, max(lo.Offset-lag, 0), -1)
			}
		}
		if err := adm.CommitAllOffsets(ctx, gd.name, offsets); err != nil {
			log.Printf("  commit offsets for %s: %v", gd.name, err)
			continue
		}
		log.Printf("  committed offsets for group %s (lag ~%d per partition)", gd.name, gd.lag)
	}
}

func advanceGroupOffsets(ctx context.Context, adm *kadm.Client) {
	endOffsets, err := adm.ListEndOffsets(ctx, topicNames()...)
	if err != nil {
		log.Fatalf("list end offsets: %v", err)
	}

	for _, gd := range groups {
		committed, err := adm.FetchOffsetsForTopics(ctx, gd.name, gd.topics...)
		if err != nil {
			log.Printf("  fetch offsets for %s: %v", gd.name, err)
			continue
		}

		var newOffsets kadm.Offsets
		for _, topic := range gd.topics {
			endParts, ok := endOffsets[topic]
			if !ok {
				continue
			}
			for _, end := range endParts {
				current := int64(0)
				if or, ok := committed.Lookup(topic, end.Partition); ok && or.At >= 0 {
					current = or.At
				}
				var next int64
				if *drain {
					next = end.Offset
				} else {
					next = min(current+*step, end.Offset)
				}
				newOffsets.AddOffset(topic, end.Partition, next, -1)
			}
		}
		if err := adm.CommitAllOffsets(ctx, gd.name, newOffsets); err != nil {
			log.Printf("  advance offsets for %s: %v", gd.name, err)
			continue
		}
		if *drain {
			log.Printf("  drained group %s to end (lag = 0)", gd.name)
		} else {
			log.Printf("  advanced group %s by %d per partition", gd.name, *step)
		}
	}
}

// produceBinaryMessages creates the binary-test topic and produces a mix of
// binary-encoded messages (Avro-style with magic byte + schema ID, raw bytes,
// and protobuf-style length-delimited) alongside a few plain UTF-8 messages
// so the UI can be verified to handle each case correctly.
func produceBinaryMessages(ctx context.Context, cl *kgo.Client, adm *kadm.Client) {
	const topic = "binary-test"

	// Create topic (ignore already-exists).
	resp, err := adm.CreateTopics(ctx, 1, 1, nil, topic)
	if err != nil {
		log.Fatalf("create topic %s: %v", topic, err)
	}
	for _, r := range resp {
		if r.Err == kerr.TopicAlreadyExists {
			log.Printf("  topic %s already exists", r.Topic)
		} else if r.Err != nil {
			log.Fatalf("  create topic %s: %v", r.Topic, r.Err)
		} else {
			log.Printf("  created topic %s", r.Topic)
		}
	}

	n := countOr(50)
	records := make([]*kgo.Record, 0, n)
	for i := 0; i < n; i++ {
		var key, value []byte
		var hdrs []kgo.RecordHeader
		switch i % 4 {
		case 0:
			// Avro: magic byte 0x00 + 4-byte schema ID (big-endian) + binary payload.
			schemaID := uint32(rand.Intn(10) + 1)
			payload := randomBytes(rand.Intn(40) + 20)
			value = make([]byte, 5+len(payload))
			value[0] = 0x00
			binary.BigEndian.PutUint32(value[1:5], schemaID)
			copy(value[5:], payload)
			key = []byte(uuid.New().String()) // UTF-8 key, binary value
			hdrs = []kgo.RecordHeader{
				{Key: "content-type", Value: []byte("application/avro")},
				{Key: "schema-id", Value: randomBytes(4)}, // binary header value
			}
		case 1:
			// Protobuf-style: raw binary, no magic byte.
			value = randomBytes(rand.Intn(60) + 10)
			key = randomBytes(8) // binary key too
			hdrs = []kgo.RecordHeader{
				{Key: "content-type", Value: []byte("application/protobuf")},
			}
		case 2:
			// Null bytes mixed with text — invalid UTF-8.
			value = mixedBytes(fmt.Sprintf(`{"id":%d}`, i))
			key = []byte(fmt.Sprintf("key-%d", i))
		case 3:
			// Plain UTF-8 for comparison — should render normally.
			v, _ := json.Marshal(map[string]any{
				"id":   i,
				"note": "plain utf-8 message",
				"ts":   time.Now().UnixMilli(),
			})
			value = v
			key = []byte(fmt.Sprintf("utf8-key-%d", i))
		}
		records = append(records, &kgo.Record{
			Topic:   topic,
			Key:     key,
			Value:   value,
			Headers: hdrs,
		})
	}

	if err := cl.ProduceSync(ctx, records...).FirstErr(); err != nil {
		log.Fatalf("produce to %s: %v", topic, err)
	}
	log.Printf("  produced %d messages to %s (avro/protobuf/mixed-binary/utf8)", n, topic)
}

// randomBytes returns n random bytes that are unlikely to be valid UTF-8.
func randomBytes(n int) []byte {
	b := make([]byte, n)
	for i := range b {
		// Use the high byte range (0x80-0xFF) so the result is guaranteed non-UTF-8.
		b[i] = byte(0x80 + rand.Intn(0x7F))
	}
	return b
}

// mixedBytes embeds null bytes into a string to produce invalid UTF-8.
func mixedBytes(s string) []byte {
	b := []byte(s)
	// Sprinkle a null and a high byte in the middle.
	if len(b) > 4 {
		b[2] = 0x00
		b[3] = 0xFF
	}
	return b
}
