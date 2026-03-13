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
	opExists   filterOp = iota
	opEq
	opNe
	opGt
	opGte
	opLt
	opLte
	opContains
)

type parsedQuery struct {
	raw     string // original (for plain-text mode)
	isPlain bool
	path    string
	op      filterOp
	litType string // "string" | "number" | "bool"
	strVal  string
	numVal  float64
	boolVal bool
}

// parseQuery parses a search query string into a parsedQuery.
// Supports plain text, gjson path existence checks, and path+operator comparisons.
func parseQuery(q string) (parsedQuery, error) {
	q = strings.TrimSpace(q)
	if q == "" {
		return parsedQuery{}, fmt.Errorf("query is required")
	}

	pq := parsedQuery{raw: q}

	// Strip leading $. or $ (common JSONPath prefix)
	stripped := q
	if strings.HasPrefix(stripped, "$.") {
		stripped = stripped[2:]
	} else if strings.HasPrefix(stripped, "$") {
		stripped = stripped[1:]
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

	// No operator found — check if it looks like a path (dot, no spaces)
	if strings.Contains(stripped, ".") && !strings.Contains(stripped, " ") {
		pq.path = stripped
		pq.op = opExists
		return pq, nil
	}

	// Plain text search
	pq.isPlain = true
	return pq, nil
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
