package main

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"math/rand"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/google/uuid"
	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kgo"
)

var (
	broker  = flag.String("broker", "localhost:9092", "Kafka bootstrap broker")
	count   = flag.Int("count", 50, "messages per topic")
	reset   = flag.Bool("reset", false, "delete and recreate topics before seeding")
	consume = flag.Bool("consume", false, "advance consumer group offsets (reduce lag)")
	step    = flag.Int64("step", 5, "messages to advance per partition (consume mode)")
	drain   = flag.Bool("drain", false, "advance all groups to end offset, zeroing lag; implies --consume")
	produce = flag.Bool("produce", false, "produce more messages to existing topics without re-seeding")
	members = flag.Bool("members", false, "start real consumers for each group (shows members in UI); runs until Ctrl+C")
	binary_ = flag.Bool("binary", false, "produce binary (non-UTF-8) messages to binary-test topic for UI testing")
)

type topicDef struct {
	name       string
	partitions int32
	configs    map[string]*string
}

var topics = []topicDef{
	{name: "orders", partitions: 3, configs: map[string]*string{"retention.ms": ptr("86400000")}},
	{name: "events", partitions: 6},
	{name: "inventory", partitions: 2},
	{name: "notifications", partitions: 1},
	{name: "dead-letter", partitions: 1},
}

type groupDef struct {
	name    string
	topics  []string
	lag     int64
	members int
}

var groups = []groupDef{
	{name: "orders-processor", topics: []string{"orders"}, lag: 1, members: 2},
	{name: "analytics-pipeline", topics: []string{"orders", "events", "inventory"}, lag: 15, members: 3},
	{name: "notification-service", topics: []string{"notifications", "orders"}, lag: 3, members: 1},
	{name: "reporting-etl", topics: []string{"orders", "events", "inventory", "notifications", "dead-letter"}, lag: 30, members: 2},
}

func main() {
	flag.Parse()

	if *members {
		ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
		defer stop()
		cleanup, wg := startGroupMembers(ctx)
		defer cleanup()
		<-ctx.Done()
		log.Println("shutting down...")
		wg.Wait()
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	cl, err := kgo.NewClient(kgo.SeedBrokers(*broker), kgo.ClientID("kafkaseed"))
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
		produceMessages(ctx, cl)
		log.Println("done")
		return
	}

	if *reset {
		deleteTopics(ctx, adm)
	}

	createTopics(ctx, adm)
	produceMessages(ctx, cl)
	commitGroupOffsets(ctx, adm)

	log.Println("done")
}

func startGroupMembers(ctx context.Context) (func(), *sync.WaitGroup) {
	var clients []*kgo.Client
	var wg sync.WaitGroup

	for _, g := range groups {
		n := g.members
		if n == 0 {
			n = 1
		}
		for i := 0; i < n; i++ {
			clientID := fmt.Sprintf("%s-worker-%d", g.name, i)
			cl, err := kgo.NewClient(
				kgo.SeedBrokers(*broker),
				kgo.ClientID(clientID),
				kgo.ConsumerGroup(g.name),
				kgo.ConsumeTopics(g.topics...),
			)
			if err != nil {
				log.Printf("failed to create consumer %s: %v", clientID, err)
				continue
			}
			clients = append(clients, cl)
			wg.Add(1)
			go func(cl *kgo.Client, id string) {
				defer wg.Done()
				for {
					fetches := cl.PollRecords(ctx, 1)
					if fetches.IsClientClosed() || ctx.Err() != nil {
						return
					}
					fetches.EachError(func(t string, p int32, err error) {
						log.Printf("fetch error [%s] topic=%s partition=%d: %v", id, t, p, err)
					})
					select {
					case <-ctx.Done():
						return
					case <-time.After(15 * time.Second):
					}
				}
			}(cl, clientID)
		}
		log.Printf("started %d consumers for group %s", n, g.name)
	}

	cleanup := func() {
		for _, cl := range clients {
			cl.Close()
		}
	}
	return cleanup, &wg
}

func deleteTopics(ctx context.Context, adm *kadm.Client) {
	names := make([]string, len(topics))
	for i, t := range topics {
		names[i] = t.name
	}
	resp, err := adm.DeleteTopics(ctx, names...)
	if err != nil {
		log.Printf("delete topics request error: %v", err)
		return
	}
	for _, r := range resp {
		if r.Err != nil && r.Err != kerr.UnknownTopicOrPartition {
			log.Printf("  delete %s: %v", r.Topic, r.Err)
		} else {
			log.Printf("  deleted topic %s", r.Topic)
		}
	}
	// Brief pause to let the broker process the deletions.
	time.Sleep(500 * time.Millisecond)
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

func produceMessages(ctx context.Context, cl *kgo.Client) {
	generators := map[string]func() []byte{
		"orders":        orderMsg,
		"events":        eventMsg,
		"inventory":     inventoryMsg,
		"notifications": notificationMsg,
		"dead-letter":   deadLetterMsg,
	}

	for _, td := range topics {
		gen := generators[td.name]
		records := make([]*kgo.Record, *count)
		for i := range records {
			records[i] = &kgo.Record{
				Topic: td.name,
				Key:   []byte(uuid.New().String()),
				Value: gen(),
			}
		}
		if err := cl.ProduceSync(ctx, records...).FirstErr(); err != nil {
			log.Fatalf("produce to %s: %v", td.name, err)
		}
		log.Printf("  produced %d messages to %s", *count, td.name)
	}
}

func commitGroupOffsets(ctx context.Context, adm *kadm.Client) {
	topicNames := make([]string, len(topics))
	for i, t := range topics {
		topicNames[i] = t.name
	}

	endOffsets, err := adm.ListEndOffsets(ctx, topicNames...)
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
			for _, lo := range partOffsets {
				committed := lo.Offset - gd.lag
				if committed < 0 {
					committed = 0
				}
				offsets.AddOffset(topic, lo.Partition, committed, -1)
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
	topicNames := make([]string, len(topics))
	for i, t := range topics {
		topicNames[i] = t.name
	}

	endOffsets, err := adm.ListEndOffsets(ctx, topicNames...)
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
					next = current + *step
					if next > end.Offset {
						next = end.Offset
					}
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

// --- message generators ---

var statuses = []string{"pending", "processing", "shipped", "delivered", "cancelled"}
var skus = []string{"SKU-001", "SKU-042", "SKU-117", "SKU-203", "SKU-388"}
var eventTypes = []string{"page_view", "click", "purchase", "search"}
var channels = []string{"email", "sms", "push"}
var warehouses = []string{"WH-EAST", "WH-WEST", "WH-CENTRAL"}
var deadLetterTopics = []string{"orders", "events", "inventory"}
var deadLetterReasons = []string{"schema_validation_failed", "deserialization_error", "downstream_timeout"}

func orderMsg() []byte {
	items := make([]map[string]any, rand.Intn(3)+1)
	for i := range items {
		items[i] = map[string]any{
			"sku": skus[rand.Intn(len(skus))],
			"qty": rand.Intn(5) + 1,
		}
	}
	v, _ := json.Marshal(map[string]any{
		"orderId":    uuid.New().String(),
		"customerId": fmt.Sprintf("cust-%04d", rand.Intn(1000)),
		"items":      items,
		"status":     statuses[rand.Intn(len(statuses))],
		"total":      float64(rand.Intn(49900)+100) / 100.0,
	})
	return v
}

func eventMsg() []byte {
	v, _ := json.Marshal(map[string]any{
		"eventId": uuid.New().String(),
		"type":    eventTypes[rand.Intn(len(eventTypes))],
		"userId":  fmt.Sprintf("user-%04d", rand.Intn(500)),
		"ts":      time.Now().UnixMilli(),
	})
	return v
}

func inventoryMsg() []byte {
	v, _ := json.Marshal(map[string]any{
		"sku":         skus[rand.Intn(len(skus))],
		"warehouseId": warehouses[rand.Intn(len(warehouses))],
		"qty":         rand.Intn(500),
		"reserved":    rand.Intn(50),
	})
	return v
}

func notificationMsg() []byte {
	v, _ := json.Marshal(map[string]any{
		"notificationId": uuid.New().String(),
		"userId":         fmt.Sprintf("user-%04d", rand.Intn(500)),
		"channel":        channels[rand.Intn(len(channels))],
		"status":         "queued",
	})
	return v
}

func deadLetterMsg() []byte {
	orig := deadLetterTopics[rand.Intn(len(deadLetterTopics))]
	payload, _ := json.Marshal(map[string]any{"raw": uuid.New().String()})
	v, _ := json.Marshal(map[string]any{
		"originalTopic": orig,
		"reason":        deadLetterReasons[rand.Intn(len(deadLetterReasons))],
		"payload":       string(payload),
	})
	return v
}

func ptr(s string) *string { return &s }

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

	n := *count
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
