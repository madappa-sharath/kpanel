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
	{name: "inventory", partitions: 3, messages: 600, gen: inventoryMsg, msgsPerSec: 2},
	{name: "notifications", partitions: 3, messages: 900, gen: notificationMsg},
	{name: "orders.dlq", partitions: 1, messages: 37, gen: deadLetterMsg, configs: retention("30d")},
	{name: "shipments", partitions: 3, messages: 700, gen: shipmentMsg},
	{name: "returns", partitions: 2, messages: 140, gen: returnMsg},
	{name: "reviews", partitions: 3, messages: 320, gen: reviewMsg},
	{name: "search-queries", partitions: 6, messages: 2600, gen: searchMsg, msgsPerSec: 12, configs: retention("1d")},
	{name: "user-sessions", partitions: 6, messages: 1500, gen: sessionMsg},
	{name: "auth-events", partitions: 3, messages: 820, gen: authMsg, configs: retention("30d")},
	{name: "audit-log", partitions: 2, messages: 260, gen: auditMsg, configs: map[string]*string{"retention.ms": ptr("-1"), "cleanup.policy": ptr("delete")}},
	{name: "product-catalog", partitions: 3, messages: 180, gen: catalogMsg, configs: map[string]*string{"cleanup.policy": ptr("compact")}},
	{name: "price-updates", partitions: 3, messages: 450, gen: priceMsg},
	{name: "promotions", partitions: 1, messages: 24, gen: promotionMsg, configs: map[string]*string{"cleanup.policy": ptr("compact")}},
	{name: "recommendations", partitions: 6, messages: 900, gen: recommendationMsg},
	{name: "email-outbound", partitions: 3, messages: 380, gen: emailMsg},
	{name: "sms-outbound", partitions: 1, messages: 95, gen: smsMsg},
	{name: "push-outbound", partitions: 2, messages: 410, gen: pushMsg},
	{name: "fraud-signals", partitions: 3, messages: 160, gen: fraudMsg, configs: retention("30d")},
	{name: "clickstream-raw", partitions: 12, messages: 3600, gen: clickMsg, msgsPerSec: 20, configs: retention("1d")},
	{name: "clickstream-hourly", partitions: 3, messages: 240, gen: hourlyMsg},
	{name: "etl-errors", partitions: 1, messages: 12, gen: etlErrorMsg},
	{name: "config-changes", partitions: 1, messages: 18, gen: configChangeMsg, configs: map[string]*string{"cleanup.policy": ptr("compact")}},
	{name: "feature-flags", partitions: 1, messages: 9, gen: featureFlagMsg, configs: map[string]*string{"cleanup.policy": ptr("compact")}},
	{name: "metrics-ingest", partitions: 6, messages: 3000, gen: metricMsg, configs: retention("1d")},
	{name: "app-logs", partitions: 6, messages: 2000, gen: logMsg, configs: retention("3d")},
	{name: "cdc.public.customers", partitions: 3, messages: 300, gen: cdcCustomerMsg},
	{name: "cdc.public.products", partitions: 3, messages: 220, gen: cdcProductMsg},
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
	{name: "inventory-sync", topics: []string{"inventory", "cdc.public.products", "price-updates"}, lag: 11, members: 2, msgsPerSec: 5},
	{name: "notification-dispatcher", topics: []string{"notifications", "email-outbound", "sms-outbound", "push-outbound"}, lag: 3, members: 2, msgsPerSec: 2},
	{name: "fraud-scorer", topics: []string{"payments", "orders", "auth-events", "fraud-signals"}, lag: 9, members: 3, msgsPerSec: 18},
	{name: "returns-processor", topics: []string{"returns", "orders"}, lag: 8, members: 1, msgsPerSec: 9},
	{name: "review-moderation", topics: []string{"reviews"}, lag: 14, members: 1, msgsPerSec: 0.2},
	{name: "search-indexer", topics: []string{"search-queries", "product-catalog", "price-updates"}, lag: 0, members: 3, msgsPerSec: 20},
	{name: "session-aggregator", topics: []string{"user-sessions", "auth-events", "user-events"}, lag: 25, members: 4, msgsPerSec: 45},
	{name: "audit-archiver", topics: []string{"audit-log", "config-changes"}, lag: 0, members: 1, msgsPerSec: 1},
	{name: "catalog-sync", topics: []string{"product-catalog", "price-updates", "promotions", "cdc.public.products"}, lag: 3, members: 2, msgsPerSec: 1},
	{name: "recommendation-engine", topics: []string{"recommendations", "user-events", "search-queries"}, lag: 60, members: 4, msgsPerSec: 30},
	{name: "clickstream-etl", topics: []string{"clickstream-raw", "user-events"}, lag: 180, members: 3, msgsPerSec: 32},
	{name: "hourly-rollup", topics: []string{"clickstream-hourly"}, lag: 40, members: 1, msgsPerSec: 0.1},
	{name: "dlq-replayer", topics: []string{"orders.dlq", "etl-errors"}, lag: 5, members: 1, msgsPerSec: 0.05},
	{name: "flag-watcher", topics: []string{"feature-flags", "config-changes"}, lag: 0, members: 2, msgsPerSec: 1},
	{name: "metrics-writer", topics: []string{"metrics-ingest"}, lag: 12, members: 3, msgsPerSec: 2},
	{name: "log-shipper", topics: []string{"app-logs"}, lag: 30, members: 2, msgsPerSec: 2},
	{name: "customer-360", topics: []string{"cdc.public.customers", "orders", "reviews"}, lag: 16, members: 2, msgsPerSec: 10},
	{name: "warehouse-loader", topics: []string{"orders", "payments", "shipments", "returns", "cdc.public.customers"}, lag: 120, members: 0},
}

func retention(d string) map[string]*string {
	ms := map[string]string{"1d": "86400000", "3d": "259200000", "7d": "604800000", "30d": "2592000000"}[d]
	return map[string]*string{"retention.ms": ptr(ms)}
}

func ptr(s string) *string { return &s }

// --- reference data ---

var (
	firstNames = []string{"Ava", "Noah", "Mia", "Liam", "Zoe", "Ethan", "Priya", "Arjun", "Sofia", "Lucas", "Hana", "Mateo", "Amara", "Jonas", "Leila", "Kenji"}
	lastNames  = []string{"Patel", "Nguyen", "Garcia", "Kim", "Schmidt", "Rossi", "Okafor", "Silva", "Novak", "Tanaka", "Haddad", "Larsen"}
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
	orderStatuses    = []string{"created", "created", "paid", "paid", "paid", "packed", "shipped", "shipped", "delivered", "cancelled"}
	paymentMethods   = []string{"card", "card", "card", "apple_pay", "google_pay", "paypal", "klarna"}
	cardBrands       = []string{"visa", "visa", "mastercard", "amex"}
	declineCodes     = []string{"insufficient_funds", "do_not_honor", "expired_card", "fraud_suspected"}
	carriers         = []string{"ups", "fedex", "dhl", "usps"}
	warehouses       = []string{"wh-us-east-1", "wh-us-west-2", "wh-eu-central-1"}
	devices          = []string{"web", "web", "ios", "android"}
	pages            = []string{"/", "/c/apparel", "/c/electronics", "/c/home", "/p/merino-crew-tee", "/p/wireless-headphones", "/cart", "/checkout", "/account/orders", "/search"}
	userEventTypes   = []string{"page_view", "page_view", "page_view", "product_view", "product_view", "add_to_cart", "search", "checkout_started", "purchase"}
	searchTerms      = []string{"hoodie", "black sneakers", "wireless headphones", "rain jacket", "merino", "coffee", "backpack", "desk lamp", "socks", "gift card", "mug", "keyboard"}
	services         = []string{"checkout-api", "order-service", "payment-service", "catalog-api", "search-api", "auth-service", "fulfilment-service"}
	logLevels        = []string{"INFO", "INFO", "INFO", "INFO", "DEBUG", "WARN", "ERROR"}
	regions          = []string{"us-east-1", "us-west-2", "eu-central-1"}
	notificationKind = []string{"order_confirmation", "shipping_update", "delivery_confirmation", "password_reset", "back_in_stock", "review_request"}
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

func person(r *rand.Rand) (string, string) {
	f, l := pick(r, firstNames), pick(r, lastNames)
	return f + " " + l, fmt.Sprintf("%s.%s%d@example.com", lower(f), lower(l), r.Intn(90)+10)
}

func lower(s string) string {
	b := []byte(s)
	for i, c := range b {
		if c >= 'A' && c <= 'Z' {
			b[i] = c + 32
		}
	}
	return string(b)
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

func inventoryMsg(r *rand.Rand) message {
	p := pick(r, products)
	wh := pick(r, warehouses)
	onHand := r.Intn(800)
	return message{
		key:     p.sku + "@" + wh,
		value:   map[string]any{"sku": p.sku, "warehouse": wh, "onHand": onHand, "reserved": r.Intn(60), "reorderPoint": 50, "reason": pick(r, []string{"sale", "sale", "restock", "adjustment", "return"})},
		headers: traceHeaders(r, "fulfilment-service", "inventory.StockLevel/v1"),
	}
}

func notificationMsg(r *rand.Rand) message {
	cid := customerID(r)
	return message{
		key:     cid,
		value:   map[string]any{"notificationId": "ntf_" + id(r)[:16], "customerId": cid, "kind": pick(r, notificationKind), "channels": []string{pick(r, []string{"email", "push", "sms"})}, "locale": pick(r, []string{"en-US", "en-GB", "de-DE", "fr-FR"})},
		headers: traceHeaders(r, "order-service", "notifications.Request/v1"),
	}
}

func deadLetterMsg(r *rand.Rand) message {
	oid := orderID(r)
	return message{
		key: oid,
		value: map[string]any{
			"originalTopic":     "orders",
			"originalPartition": r.Intn(6),
			"originalOffset":    r.Intn(1800),
			"consumerGroup":     pick(r, []string{"fulfilment-service", "warehouse-loader", "customer-360"}),
			"error":             pick(r, []string{"SchemaValidationError: totals.tax is required", "TimeoutException: inventory-api did not respond in 5000ms", "JsonParseException: unexpected end of input"}),
			"attempts":          r.Intn(4) + 3,
		},
		headers: map[string]string{"content-type": "application/json", "dlq.reason": "max-retries-exceeded"},
	}
}

func shipmentMsg(r *rand.Rand) message {
	oid := orderID(r)
	return message{
		key: oid,
		value: map[string]any{
			"shipmentId": "shp_" + id(r)[:14], "orderId": oid, "carrier": pick(r, carriers),
			"trackingNumber": fmt.Sprintf("1Z%04X%010d", r.Intn(65535), r.Int63n(9999999999)),
			"status":         pick(r, []string{"label_created", "picked_up", "in_transit", "in_transit", "out_for_delivery", "delivered"}),
			"warehouse":      pick(r, warehouses), "parcels": r.Intn(2) + 1,
		},
		headers: traceHeaders(r, "fulfilment-service", "shipping.ShipmentEvent/v2"),
	}
}

func returnMsg(r *rand.Rand) message {
	oid := orderID(r)
	p := pick(r, products)
	return message{
		key:     oid,
		value:   map[string]any{"returnId": "rtn_" + id(r)[:12], "orderId": oid, "sku": p.sku, "reason": pick(r, []string{"wrong_size", "wrong_size", "damaged", "not_as_described", "changed_mind"}), "refundAmount": p.price, "status": pick(r, []string{"requested", "approved", "received", "refunded"})},
		headers: traceHeaders(r, "order-service", "returns.ReturnEvent/v1"),
	}
}

func reviewMsg(r *rand.Rand) message {
	p := pick(r, products)
	rating := []int{5, 5, 5, 4, 4, 3, 2, 1}[r.Intn(8)]
	text := map[int]string{5: "Exactly as described, would buy again.", 4: "Good quality, runs slightly small.", 3: "It's fine. Took a while to arrive.", 2: "Colour is different from the photos.", 1: "Arrived damaged, waiting on a replacement."}[rating]
	return message{
		key:     p.sku,
		value:   map[string]any{"reviewId": "rev_" + id(r)[:12], "sku": p.sku, "customerId": customerID(r), "rating": rating, "title": text[:min(len(text), 24)], "body": text, "verifiedPurchase": r.Intn(5) > 0},
		headers: traceHeaders(r, "catalog-api", "reviews.Review/v1"),
	}
}

func searchMsg(r *rand.Rand) message {
	q := pick(r, searchTerms)
	return message{
		key:     "ses_" + id(r)[:12],
		value:   map[string]any{"query": q, "results": r.Intn(240), "latencyMs": 12 + r.Intn(140), "page": 1 + r.Intn(3)/2, "filters": map[string]any{"inStock": r.Intn(2) == 0}, "clickedRank": []any{nil, 1, 1, 2, 3, 5}[r.Intn(6)]},
		headers: map[string]string{"content-type": "application/json", "source": "search-api"},
	}
}

func sessionMsg(r *rand.Rand) message {
	uid := fmt.Sprintf("usr_%06d", r.Intn(250000))
	return message{
		key:   uid,
		value: map[string]any{"sessionId": "ses_" + id(r)[:12], "userId": uid, "device": pick(r, devices), "durationSec": 20 + r.Intn(1500), "pageViews": 1 + r.Intn(24), "converted": r.Intn(12) == 0, "landing": pick(r, pages)},
	}
}

func authMsg(r *rand.Rand) message {
	cid := customerID(r)
	outcome := pick(r, []string{"success", "success", "success", "success", "failure", "mfa_challenge"})
	return message{
		key:     cid,
		value:   map[string]any{"eventId": id(r), "customerId": cid, "action": pick(r, []string{"login", "login", "logout", "token_refresh", "password_reset"}), "outcome": outcome, "ip": fmt.Sprintf("203.0.113.%d", r.Intn(254)+1), "userAgent": pick(r, []string{"Safari/17.4 iPhone", "Chrome/131 macOS", "Chrome/131 Android", "Firefox/133 Windows"})},
		headers: traceHeaders(r, "auth-service", "auth.AuthEvent/v1"),
	}
}

func auditMsg(r *rand.Rand) message {
	actor := pick(r, []string{"ops@example.com", "j.kim@example.com", "deploy-bot", "s.okafor@example.com"})
	return message{
		key:   actor,
		value: map[string]any{"actor": actor, "action": pick(r, []string{"topic.config.update", "user.role.grant", "deploy.promote", "secret.rotate"}), "target": pick(r, services), "result": "allowed"},
	}
}

func catalogMsg(r *rand.Rand) message {
	p := pick(r, products)
	return message{
		key:     p.sku,
		value:   map[string]any{"sku": p.sku, "name": p.name, "category": p.category, "price": p.price, "currency": "USD", "active": true, "updatedBy": "catalog-api"},
		headers: traceHeaders(r, "catalog-api", "catalog.Product/v4"),
	}
}

func priceMsg(r *rand.Rand) message {
	p := pick(r, products)
	newPrice := money(p.price * (0.8 + r.Float64()*0.3))
	return message{key: p.sku, value: map[string]any{"sku": p.sku, "oldPrice": p.price, "newPrice": newPrice, "currency": "USD", "reason": pick(r, []string{"promotion", "repricing", "competitor_match"})}}
}

func promotionMsg(r *rand.Rand) message {
	code := pick(r, []string{"WINTER20", "FREESHIP", "WELCOME10", "BUNDLE15", "VIP25"})
	return message{key: code, value: map[string]any{"code": code, "percentOff": pick(r, []int{10, 15, 20, 25}), "minSubtotal": pick(r, []int{0, 50, 100}), "active": r.Intn(4) > 0}}
}

func recommendationMsg(r *rand.Rand) message {
	uid := fmt.Sprintf("usr_%06d", r.Intn(250000))
	recs := make([]map[string]any, 3)
	for i := range recs {
		p := pick(r, products)
		recs[i] = map[string]any{"sku": p.sku, "score": money(0.95 - float64(i)*0.1 - r.Float64()*0.05)}
	}
	return message{key: uid, value: map[string]any{"userId": uid, "model": "two-tower-v7", "slot": pick(r, []string{"home_hero", "pdp_similar", "cart_upsell"}), "items": recs}}
}

func emailMsg(r *rand.Rand) message {
	name, email := person(r)
	return message{key: email, value: map[string]any{"to": email, "name": name, "template": pick(r, notificationKind), "provider": "ses", "priority": pick(r, []string{"normal", "normal", "high"})}}
}

func smsMsg(r *rand.Rand) message {
	cid := customerID(r)
	return message{key: cid, value: map[string]any{"customerId": cid, "to": fmt.Sprintf("+1555%07d", r.Intn(10000000)), "template": pick(r, []string{"otp", "delivery_window", "shipping_update"}), "provider": "twilio"}}
}

func pushMsg(r *rand.Rand) message {
	cid := customerID(r)
	return message{key: cid, value: map[string]any{"customerId": cid, "platform": pick(r, []string{"ios", "android"}), "title": pick(r, []string{"Your order has shipped", "Back in stock", "Out for delivery today"}), "deepLink": "shop://orders/" + orderID(r)}}
}

func fraudMsg(r *rand.Rand) message {
	oid := orderID(r)
	score := money(0.5 + r.Float64()*0.5)
	decision := "review"
	if score > 0.9 {
		decision = "block"
	}
	return message{
		key:     oid,
		value:   map[string]any{"orderId": oid, "customerId": customerID(r), "score": score, "decision": decision, "signals": []string{pick(r, []string{"velocity_card", "ip_country_mismatch", "new_device"}), pick(r, []string{"high_value_first_order", "billing_shipping_mismatch", "disposable_email"})}, "model": "gbdt-2026-10"},
		headers: traceHeaders(r, "fraud-scorer", "fraud.Signal/v2"),
	}
}

func clickMsg(r *rand.Rand) message {
	anon := "anon_" + id(r)[:10]
	return message{key: anon, value: map[string]any{"anonId": anon, "page": pick(r, pages), "element": pick(r, []string{"nav.category", "pdp.add_to_cart", "plp.product_card", "header.search", "cart.checkout"}), "x": r.Intn(1440), "y": r.Intn(900), "viewport": "1440x900", "referrer": pick(r, []string{"google", "direct", "instagram", "newsletter"})}}
}

func hourlyMsg(r *rand.Rand) message {
	page := pick(r, pages)
	return message{key: page, value: map[string]any{"page": page, "views": 200 + r.Intn(9000), "uniqueVisitors": 100 + r.Intn(4000), "bounceRate": money(0.2 + r.Float64()*0.5), "window": "PT1H"}}
}

func etlErrorMsg(r *rand.Rand) message {
	job := pick(r, []string{"orders_to_warehouse", "clickstream_rollup", "customer_snapshot"})
	return message{key: job, value: map[string]any{"job": job, "stage": pick(r, []string{"extract", "transform", "load"}), "error": pick(r, []string{"column \"shipping_tier\" does not exist", "S3 PutObject throttled (SlowDown)", "row 18234: invalid timestamp"}), "rowsFailed": r.Intn(400) + 1}}
}

func configChangeMsg(r *rand.Rand) message {
	svc := pick(r, services)
	return message{key: svc, value: map[string]any{"service": svc, "key": pick(r, []string{"http.timeout_ms", "db.pool_size", "retry.max_attempts", "cache.ttl_sec"}), "value": pick(r, []int{5, 10, 30, 3000, 5000}), "changedBy": pick(r, []string{"j.kim@example.com", "deploy-bot"})}}
}

func featureFlagMsg(r *rand.Rand) message {
	flag := pick(r, []string{"checkout.one_page", "search.semantic_v2", "pdp.size_guide", "cart.save_for_later"})
	return message{key: flag, value: map[string]any{"flag": flag, "enabled": r.Intn(3) > 0, "rolloutPercent": pick(r, []int{5, 25, 50, 100}), "segments": []string{"internal", pick(r, []string{"beta", "us-only", "all"})}}}
}

func metricMsg(r *rand.Rand) message {
	host := fmt.Sprintf("%s-%s-%d", pick(r, services), pick(r, regions), r.Intn(6))
	return message{key: host, value: map[string]any{"host": host, "metric": pick(r, []string{"http.requests", "http.latency_p99_ms", "jvm.heap_used_mb", "cpu.utilization"}), "value": money(r.Float64() * 900), "tags": map[string]string{"env": "prod"}}}
}

func logMsg(r *rand.Rand) message {
	svc := pick(r, services)
	level := pick(r, logLevels)
	msg := map[string]string{"INFO": "request completed", "DEBUG": "cache hit", "WARN": "slow query over 500ms", "ERROR": "upstream returned 503"}[level]
	return message{key: svc, value: map[string]any{"service": svc, "level": level, "msg": msg, "status": pick(r, []int{200, 200, 200, 201, 404, 503}), "durationMs": 3 + r.Intn(900), "pod": fmt.Sprintf("%s-%x", svc, r.Intn(0xfffff))}}
}

func cdcCustomerMsg(r *rand.Rand) message {
	cid := customerID(r)
	name, email := person(r)
	return message{
		key: cid,
		value: map[string]any{
			"op":     pick(r, []string{"c", "u", "u", "u"}),
			"source": map[string]any{"db": "shop", "table": "customers", "lsn": 81920000 + r.Intn(100000)},
			"after":  map[string]any{"id": cid, "name": name, "email": email, "country": pick(r, countries), "tier": pick(r, []string{"standard", "standard", "plus", "vip"})},
		},
		headers: map[string]string{"content-type": "application/json", "source": "debezium"},
	}
}

func cdcProductMsg(r *rand.Rand) message {
	p := pick(r, products)
	return message{
		key: p.sku,
		value: map[string]any{
			"op":     "u",
			"source": map[string]any{"db": "shop", "table": "products", "lsn": 81920000 + r.Intn(100000)},
			"after":  map[string]any{"sku": p.sku, "name": p.name, "price": p.price, "stock": r.Intn(800)},
		},
		headers: map[string]string{"content-type": "application/json", "source": "debezium"},
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
