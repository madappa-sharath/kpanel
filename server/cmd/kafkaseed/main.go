package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"math/rand"
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
	name   string
	topics []string
	lag    int64
}

var groups = []groupDef{
	{name: "orders-processor", topics: []string{"orders"}, lag: 1},
	{name: "analytics-pipeline", topics: []string{"orders", "events", "inventory"}, lag: 15},
	{name: "notification-service", topics: []string{"notifications", "orders"}, lag: 3},
	{name: "reporting-etl", topics: []string{"orders", "events", "inventory", "notifications", "dead-letter"}, lag: 30},
}

func main() {
	flag.Parse()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	cl, err := kgo.NewClient(kgo.SeedBrokers(*broker), kgo.ClientID("kafkaseed"))
	if err != nil {
		log.Fatalf("failed to create kafka client: %v", err)
	}
	defer cl.Close()

	adm := kadm.NewClient(cl)

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
