package main

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"time"

	"github.com/google/uuid"
)

// The seed models a mid-sized online shop: storefront traffic, orders and
// payments, fulfilment, messaging, fraud, analytics and CDC feeds.

type topicDef struct {
	name       string
	partitions int32
	messages   int // messages produced by a full seed
	configs    map[string]*string
	gen        func(r *rand.Rand) message
	// msgsPerSec is the produce rate used by --traffic; 0 means no live traffic.
	msgsPerSec float64
}

type message struct {
	key     string
	value   any
	headers map[string]string
}

var topics = []topicDef{
	{name: "orders", partitions: 6, messages: 1800, gen: orderMsg, msgsPerSec: 6, configs: retention("7d")},
	{name: "payments", partitions: 6, messages: 1500, gen: paymentMsg, msgsPerSec: 5, configs: retention("30d")},
	{name: "user-events", partitions: 12, messages: 4800, gen: userEventMsg, msgsPerSec: 30, configs: retention("3d")},
	{name: "clickstream-raw", partitions: 12, messages: 3600, gen: genericMsg("web-tracker"), msgsPerSec: 20, configs: retention("1d")},
	{name: "inventory", partitions: 3, messages: 600, gen: genericMsg("fulfilment-service"), msgsPerSec: 2},
	{name: "shipments", partitions: 3, messages: 700, gen: genericMsg("fulfilment-service")},
	{name: "notifications", partitions: 3, messages: 900, gen: genericMsg("order-service")},
	{name: "orders.dlq", partitions: 1, messages: 37, gen: genericMsg("order-service"), configs: retention("30d")},
	{name: "search-queries", partitions: 6, messages: 2600, gen: genericMsg("search-api"), msgsPerSec: 12, configs: retention("1d")},
	{name: "cdc.public.customers", partitions: 3, messages: 300, gen: genericMsg("debezium")},
	{name: "audit-log", partitions: 2, messages: 260, gen: genericMsg("auth-service"), configs: map[string]*string{"retention.ms": ptr("-1")}},
	{name: "app-logs", partitions: 6, messages: 2000, gen: genericMsg("checkout-api"), configs: retention("3d")},
}

type groupDef struct {
	name    string
	topics  []string
	lag     int64 // committed offset sits this far behind the end, per partition (jittered)
	members int
	// msgsPerSec is how fast the group consumes during --traffic, summed over members.
	msgsPerSec float64
}

var groups = []groupDef{
	{name: "order-service", topics: []string{"orders"}, lag: 2, members: 3, msgsPerSec: 20},
	{name: "payment-service", topics: []string{"payments", "orders"}, lag: 4, members: 3, msgsPerSec: 25},
	{name: "fulfilment-service", topics: []string{"orders", "shipments", "inventory"}, lag: 6, members: 2, msgsPerSec: 15},
	{name: "notification-dispatcher", topics: []string{"notifications"}, lag: 3, members: 2, msgsPerSec: 1},
	{name: "search-indexer", topics: []string{"search-queries"}, lag: 0, members: 3, msgsPerSec: 20},
	{name: "recommendation-engine", topics: []string{"user-events", "search-queries"}, lag: 60, members: 4, msgsPerSec: 30},
	{name: "clickstream-etl", topics: []string{"clickstream-raw", "user-events"}, lag: 180, members: 3, msgsPerSec: 32},
	{name: "customer-360", topics: []string{"cdc.public.customers", "orders"}, lag: 16, members: 2, msgsPerSec: 10},
	{name: "log-shipper", topics: []string{"app-logs"}, lag: 30, members: 2, msgsPerSec: 2},
	{name: "warehouse-loader", topics: []string{"orders", "payments", "shipments", "cdc.public.customers"}, lag: 120, members: 0},
}

func retention(d string) map[string]*string {
	ms := map[string]string{"1d": "86400000", "3d": "259200000", "7d": "604800000", "30d": "2592000000"}[d]
	return map[string]*string{"retention.ms": ptr(ms)}
}

func ptr(s string) *string { return &s }

// --- reference data ---

var (
	countries  = []string{"US", "US", "US", "GB", "DE", "FR", "NL", "CA", "AU", "IN", "JP", "BR"}
	currencies = map[string]string{"US": "USD", "GB": "GBP", "DE": "EUR", "FR": "EUR", "NL": "EUR", "CA": "CAD", "AU": "AUD", "IN": "INR", "JP": "JPY", "BR": "BRL"}
	products   = []struct {
		sku, name, category string
		price               float64
	}{
		{"TS-1042-BLK-M", "Merino Crew Tee", "apparel", 48},
		{"HD-2210-GRY-L", "Heavyweight Hoodie", "apparel", 89},
		{"SN-3301-WHT-42", "Court Sneaker", "footwear", 120},
		{"BP-0870-OLV", "Commuter Backpack 22L", "bags", 135},
		{"WB-0215-STL", "Insulated Bottle 750ml", "outdoor", 34},
		{"HP-7780-BLK", "Wireless Headphones", "electronics", 249},
		{"KB-5512-WHT", "Low-profile Keyboard", "electronics", 129},
		{"MG-0044-CRM", "Stoneware Mug", "home", 22},
		{"LM-9031-BRS", "Desk Lamp", "home", 79},
		{"JK-4420-NVY-M", "Rain Shell Jacket", "apparel", 165},
		{"SK-1001-GRY", "Wool Socks 3-pack", "apparel", 24},
		{"CH-6602-OAK", "Pour-over Coffee Set", "home", 58},
	}
	orderStatuses  = []string{"created", "created", "paid", "paid", "paid", "packed", "shipped", "shipped", "delivered", "cancelled"}
	paymentMethods = []string{"card", "card", "card", "apple_pay", "google_pay", "paypal", "klarna"}
	cardBrands     = []string{"visa", "visa", "mastercard", "amex"}
	declineCodes   = []string{"insufficient_funds", "do_not_honor", "expired_card", "fraud_suspected"}
	devices        = []string{"web", "web", "ios", "android"}
	pages          = []string{"/", "/c/apparel", "/c/electronics", "/c/home", "/p/merino-crew-tee", "/p/wireless-headphones", "/cart", "/checkout", "/account/orders", "/search"}
	userEventTypes = []string{"page_view", "page_view", "page_view", "product_view", "product_view", "add_to_cart", "search", "checkout_started", "purchase"}
	searchTerms    = []string{"hoodie", "black sneakers", "wireless headphones", "rain jacket", "merino", "coffee", "backpack", "desk lamp", "socks", "gift card", "mug", "keyboard"}
	regions        = []string{"us-east-1", "us-west-2", "eu-central-1"}
)

func pick[T any](r *rand.Rand, xs []T) T { return xs[r.Intn(len(xs))] }

func id(r *rand.Rand) string {
	u, _ := uuid.NewRandomFromReader(r)
	return u.String()
}

func customerID(r *rand.Rand) string { return fmt.Sprintf("cus_%06d", 100000+r.Intn(48000)) }
func orderID(r *rand.Rand) string    { return fmt.Sprintf("ord_%08d", 20480000+r.Intn(90000)) }
func money(v float64) float64        { return float64(int(v*100+0.5)) / 100 }

func traceHeaders(r *rand.Rand, service, schema string) map[string]string {
	return map[string]string{
		"content-type": "application/json",
		"schema":       schema,
		"source":       service,
		"traceparent":  fmt.Sprintf("00-%016x%016x-%016x-01", r.Uint64(), r.Uint64(), r.Uint64()),
	}
}

// --- message generators ---

func orderMsg(r *rand.Rand) message {
	oid, cid := orderID(r), customerID(r)
	country := pick(r, countries)
	n := r.Intn(3) + 1
	items := make([]map[string]any, n)
	var subtotal float64
	for i := range items {
		p := pick(r, products)
		qty := 1
		if r.Intn(4) == 0 {
			qty = 2
		}
		subtotal += p.price * float64(qty)
		items[i] = map[string]any{"sku": p.sku, "name": p.name, "qty": qty, "unitPrice": p.price}
	}
	shipping := 0.0
	if subtotal < 75 {
		shipping = 6.95
	}
	tax := money(subtotal * 0.08)
	return message{
		key: oid,
		value: map[string]any{
			"orderId":    oid,
			"customerId": cid,
			"status":     pick(r, orderStatuses),
			"channel":    pick(r, devices),
			"currency":   currencies[country],
			"items":      items,
			"totals":     map[string]any{"subtotal": money(subtotal), "shipping": shipping, "tax": tax, "grandTotal": money(subtotal + shipping + tax)},
			"shipTo":     map[string]any{"country": country, "postalCode": fmt.Sprintf("%05d", r.Intn(99999))},
		},
		headers: traceHeaders(r, "checkout-api", "orders.OrderEvent/v3"),
	}
}

func paymentMsg(r *rand.Rand) message {
	oid := orderID(r)
	status := "captured"
	var decline any
	switch x := r.Intn(20); {
	case x == 0:
		status, decline = "declined", pick(r, declineCodes)
	case x == 1:
		status = "refunded"
	case x < 5:
		status = "authorized"
	}
	method := pick(r, paymentMethods)
	v := map[string]any{
		"paymentId":   "pay_" + id(r)[:18],
		"orderId":     oid,
		"customerId":  customerID(r),
		"amount":      money(20 + r.Float64()*380),
		"currency":    "USD",
		"method":      method,
		"status":      status,
		"declineCode": decline,
		"riskScore":   money(r.Float64() * 0.6),
		"psp":         "adyen",
	}
	if method == "card" {
		v["card"] = map[string]any{"brand": pick(r, cardBrands), "last4": fmt.Sprintf("%04d", r.Intn(10000)), "threeDS": r.Intn(3) > 0}
	}
	return message{key: oid, value: v, headers: traceHeaders(r, "payment-service", "payments.PaymentEvent/v2")}
}

func userEventMsg(r *rand.Rand) message {
	uid := fmt.Sprintf("usr_%06d", r.Intn(250000))
	typ := pick(r, userEventTypes)
	v := map[string]any{
		"eventId":   id(r),
		"type":      typ,
		"userId":    uid,
		"sessionId": "ses_" + id(r)[:12],
		"device":    pick(r, devices),
		"page":      pick(r, pages),
		"geo":       map[string]any{"country": pick(r, countries), "region": pick(r, regions)},
	}
	switch typ {
	case "product_view", "add_to_cart":
		p := pick(r, products)
		v["product"] = map[string]any{"sku": p.sku, "category": p.category, "price": p.price}
	case "search":
		v["query"] = pick(r, searchTerms)
	case "purchase":
		v["orderId"] = orderID(r)
		v["value"] = money(30 + r.Float64()*300)
	}
	return message{key: uid, value: v, headers: map[string]string{"content-type": "application/json", "source": "web-tracker"}}
}

// genericMsg is for topics the screenshots do not open.
func genericMsg(source string) func(r *rand.Rand) message {
	return func(r *rand.Rand) message {
		k := id(r)
		return message{key: k, value: map[string]any{"id": k, "source": source}}
	}
}

func encode(m message) []byte {
	v, _ := json.Marshal(m.value)
	return v
}

// timestampFor spreads a topic's seeded messages over the window before now,
// oldest first, so offsets and timestamps both increase.
func timestampFor(now time.Time, i, n int, window time.Duration, r *rand.Rand) time.Time {
	step := window / time.Duration(n+1)
	jitter := time.Duration(r.Int63n(int64(step)/2 + 1))
	return now.Add(-window + step*time.Duration(i+1) - jitter).Truncate(time.Millisecond)
}
