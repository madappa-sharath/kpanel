package api

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/tidwall/gjson"
	"github.com/twmb/franz-go/pkg/kgo"
)

type filterOp int

const (
	opExists filterOp = iota
	opEq
	opNe
	opGt
	opGte
	opLt
	opLte
	opContains
)

type parsedQuery struct {
	raw     string // text to match in plain-text mode (outer quotes stripped)
	isPlain bool
	path    string
	op      filterOp
	litType string // "string" | "number" | "bool"
	strVal  string
	numVal  float64
	boolVal bool
}

// parseQuery parses a search query string into a parsedQuery.
//
// The query language has three shapes, resolved in this order:
//
//  1. A fully quoted query is always a literal text search — "10.0.4.17",
//     "a > b". Use it for terms that would otherwise look like an expression.
//  2. A field comparison — user.id == "abc", latency > 100, name ~= "kafka".
//     An optional $ / $. prefix on the path is stripped.
//  3. A $. prefixed path with no operator is a field-existence check —
//     $.user.premium.
//
// Anything else is a plain-text search across the record key and value, so an
// unadorned term like order.created or user@example.com searches for that text
// rather than being mistaken for a JSON path — and so does a term that merely
// starts with a dollar sign, like "$100 refund".
func parseQuery(q string) (parsedQuery, error) {
	q = strings.TrimSpace(q)
	if q == "" {
		return parsedQuery{}, fmt.Errorf("query is required")
	}

	pq := parsedQuery{raw: q}

	// A fully quoted query forces a literal text search.
	if lit, ok := quotedLiteral(q); ok {
		if lit == "" {
			return parsedQuery{}, fmt.Errorf("query is required")
		}
		pq.raw = lit
		pq.isPlain = true
		return pq, nil
	}

	// Strip a leading $. or $ (common JSONPath prefix) before looking for an
	// operator, so both $.user.id == "x" and $user.id == "x" work. Only the
	// $. form marks an operator-less query as a path: a bare $ is far more
	// likely to be a currency amount the user wants to find.
	stripped, dotPrefixed := q, false
	if rest, ok := strings.CutPrefix(q, "$."); ok {
		stripped, dotPrefixed = rest, true
	} else if rest, ok := strings.CutPrefix(q, "$"); ok {
		stripped = rest
	}

	// Scan for operators in order of precedence (longer first to avoid ambiguity)
	type opDef struct {
		token string
		op    filterOp
	}
	ops := []opDef{
		{"~=", opContains},
		{">=", opGte},
		{"<=", opLte},
		{"!=", opNe},
		{"==", opEq},
		{">", opGt},
		{"<", opLt},
	}

	for _, od := range ops {
		idx := strings.Index(stripped, od.token)
		if idx < 0 {
			continue
		}
		left := strings.TrimSpace(stripped[:idx])
		right := strings.TrimSpace(stripped[idx+len(od.token):])
		if left == "" || right == "" {
			continue
		}
		pq.path = left
		pq.op = od.op

		// Parse literal on the right
		if strings.HasPrefix(right, `"`) && strings.HasSuffix(right, `"`) && len(right) >= 2 {
			pq.litType = "string"
			pq.strVal = right[1 : len(right)-1]
		} else if right == "true" || right == "false" {
			pq.litType = "bool"
			pq.boolVal = right == "true"
		} else if f, err := strconv.ParseFloat(right, 64); err == nil {
			pq.litType = "number"
			pq.numVal = f
		} else {
			// Unquoted string fallback
			pq.litType = "string"
			pq.strVal = right
		}
		return pq, nil
	}

	// No operator — a $. prefix means "this field exists", but only when what
	// follows actually looks like a path. "$. " or "$.a b" is text.
	if dotPrefixed {
		path := strings.TrimSpace(stripped)
		if path != "" && !strings.ContainsAny(path, " \t") {
			pq.path = path
			pq.op = opExists
			return pq, nil
		}
	}

	// Plain text search, over the query exactly as typed
	pq.isPlain = true
	return pq, nil
}

// quotedLiteral reports whether q is a single double-quoted literal and returns
// its contents. A query containing further quotes (user.id == "abc") is not a
// literal, so operator parsing still gets a chance at it.
func quotedLiteral(q string) (string, bool) {
	if len(q) < 2 || !strings.HasPrefix(q, `"`) || !strings.HasSuffix(q, `"`) {
		return "", false
	}
	inner := q[1 : len(q)-1]
	if strings.Contains(inner, `"`) {
		return "", false
	}
	return inner, true
}

// matchRecord returns true if the Kafka record matches the parsed query.
func matchRecord(rec *kgo.Record, pq parsedQuery) bool {
	if pq.isPlain {
		q := strings.ToLower(pq.raw)
		keyMatch := len(rec.Key) > 0 && strings.Contains(strings.ToLower(string(rec.Key)), q)
		valMatch := strings.Contains(strings.ToLower(string(rec.Value)), q)
		return keyMatch || valMatch
	}

	// For path-based queries, skip binary (non-UTF-8) values
	valueStr := string(rec.Value)
	if !gjson.Valid(valueStr) {
		// Not valid JSON — only opExists can still match as a plain string path
		if pq.op == opExists {
			return false
		}
		return false
	}

	result := gjson.Get(valueStr, pq.path)

	// All operators except opExists require the path to be present.
	if pq.op != opExists && !result.Exists() {
		return false
	}

	switch pq.op {
	case opExists:
		return result.Exists()
	case opEq:
		return compareResult(result, pq)
	case opNe:
		return !compareResult(result, parsedQuery{litType: pq.litType, strVal: pq.strVal, numVal: pq.numVal, boolVal: pq.boolVal, op: opEq})
	case opGt:
		if pq.litType == "number" {
			return result.Float() > pq.numVal
		}
		return result.String() > pq.strVal
	case opGte:
		if pq.litType == "number" {
			return result.Float() >= pq.numVal
		}
		return result.String() >= pq.strVal
	case opLt:
		if pq.litType == "number" {
			return result.Float() < pq.numVal
		}
		return result.String() < pq.strVal
	case opLte:
		if pq.litType == "number" {
			return result.Float() <= pq.numVal
		}
		return result.String() <= pq.strVal
	case opContains:
		return strings.Contains(result.String(), pq.strVal)
	}
	return false
}

func compareResult(result gjson.Result, pq parsedQuery) bool {
	switch pq.litType {
	case "string":
		return result.String() == pq.strVal
	case "number":
		return result.Float() == pq.numVal
	case "bool":
		return result.Bool() == pq.boolVal
	}
	return false
}
