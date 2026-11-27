package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/kpanel/kpanel/internal/config"
	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kmsg"
)

const aclTimeout = 15 * time.Second

// aclBinding is the API shape of one Kafka ACL: a principal is allowed or
// denied one operation on one resource pattern from one host. Enum fields use
// the lowercase Kafka names, e.g. "transactional_id", "idempotent_write".
type aclBinding struct {
	Principal    string `json:"principal"`
	Host         string `json:"host"`
	ResourceType string `json:"resource_type"`
	ResourceName string `json:"resource_name"`
	PatternType  string `json:"pattern_type"`
	Operation    string `json:"operation"`
	Permission   string `json:"permission"`
}

type aclResult struct {
	aclBinding
	Deleted int    `json:"deleted,omitempty"`
	Error   string `json:"error,omitempty"`
}

// parsedBinding is an aclBinding translated to kmsg enums.
type parsedBinding struct {
	principal  string
	host       string
	resType    kmsg.ACLResourceType
	name       string
	pattern    kmsg.ACLResourcePatternType
	op         kmsg.ACLOperation
	permission kmsg.ACLPermissionType
}

// clusterResourceName is the only name Kafka accepts for the cluster resource.
const clusterResourceName = "kafka-cluster"

// Values a binding may not use: they are filter wildcards, not concrete ACLs.
func isConcreteResourceType(v kmsg.ACLResourceType) bool {
	return v != kmsg.ACLResourceTypeUnknown && v != kmsg.ACLResourceTypeAny
}

func isConcretePattern(v kmsg.ACLResourcePatternType) bool {
	return v == kmsg.ACLResourcePatternTypeLiteral || v == kmsg.ACLResourcePatternTypePrefixed
}

func isConcreteOperation(v kmsg.ACLOperation) bool {
	return v != kmsg.ACLOperationUnknown && v != kmsg.ACLOperationAny
}

func isConcretePermission(v kmsg.ACLPermissionType) bool {
	return v == kmsg.ACLPermissionTypeAllow || v == kmsg.ACLPermissionTypeDeny
}

// parseEnums translates the enum fields of b. Resource types kpanel does not
// offer for creation (e.g. "user") still parse, so listed bindings of those
// types can be deleted.
func parseEnums(b aclBinding) (parsedBinding, error) {
	var p parsedBinding
	var err error
	if p.resType, err = kmsg.ParseACLResourceType(b.ResourceType); err != nil || !isConcreteResourceType(p.resType) {
		return p, fmt.Errorf("invalid resource_type %q", b.ResourceType)
	}
	if p.pattern, err = kmsg.ParseACLResourcePatternType(b.PatternType); err != nil || !isConcretePattern(p.pattern) {
		return p, fmt.Errorf("invalid pattern_type %q (expected literal or prefixed)", b.PatternType)
	}
	if p.op, err = kmsg.ParseACLOperation(b.Operation); err != nil || !isConcreteOperation(p.op) {
		return p, fmt.Errorf("invalid operation %q", b.Operation)
	}
	if p.permission, err = kmsg.ParseACLPermissionType(b.Permission); err != nil || !isConcretePermission(p.permission) {
		return p, fmt.Errorf("invalid permission %q (expected allow or deny)", b.Permission)
	}
	return p, nil
}

// parseNewBinding validates a binding to create, filling defaults: a bare
// principal gets the "User:" type, the host defaults to "*", the pattern to
// literal, and the cluster resource gets its fixed name.
func parseNewBinding(b aclBinding) (parsedBinding, error) {
	if strings.TrimSpace(b.PatternType) == "" {
		b.PatternType = "literal"
	}
	p, err := parseEnums(b)
	if err != nil {
		return p, err
	}
	switch p.resType {
	case kmsg.ACLResourceTypeTopic, kmsg.ACLResourceTypeGroup, kmsg.ACLResourceTypeCluster,
		kmsg.ACLResourceTypeTransactionalId, kmsg.ACLResourceTypeDelegationToken:
	default:
		return p, fmt.Errorf("creating %s ACLs is not supported", b.ResourceType)
	}

	p.principal = strings.TrimSpace(b.Principal)
	if p.principal == "" {
		return p, errors.New("principal is required")
	}
	if !strings.Contains(p.principal, ":") {
		p.principal = "User:" + p.principal
	}
	p.host = strings.TrimSpace(b.Host)
	if p.host == "" {
		p.host = "*"
	}
	p.name = strings.TrimSpace(b.ResourceName)
	if p.resType == kmsg.ACLResourceTypeCluster {
		p.name = clusterResourceName
		p.pattern = kmsg.ACLResourcePatternTypeLiteral
	} else if p.name == "" {
		return p, errors.New("resource_name is required")
	}
	return p, nil
}

// parseExistingBinding validates a binding to delete. Every field is taken
// verbatim so the filter matches exactly the binding that was listed.
func parseExistingBinding(b aclBinding) (parsedBinding, error) {
	p, err := parseEnums(b)
	if err != nil {
		return p, err
	}
	if b.Principal == "" || b.Host == "" || b.ResourceName == "" {
		return p, errors.New("principal, host and resource_name are required")
	}
	p.principal, p.host, p.name = b.Principal, b.Host, b.ResourceName
	return p, nil
}

func enumName(v fmt.Stringer) string { return strings.ToLower(v.String()) }

func (p parsedBinding) binding() aclBinding {
	return aclBinding{
		Principal:    p.principal,
		Host:         p.host,
		ResourceType: enumName(p.resType),
		ResourceName: p.name,
		PatternType:  enumName(p.pattern),
		Operation:    enumName(p.op),
		Permission:   enumName(p.permission),
	}
}

func (p parsedBinding) creation() kmsg.CreateACLsRequestCreation {
	c := kmsg.NewCreateACLsRequestCreation()
	c.ResourceType = p.resType
	c.ResourceName = p.name
	c.ResourcePatternType = p.pattern
	c.Principal = p.principal
	c.Host = p.host
	c.Operation = p.op
	c.PermissionType = p.permission
	return c
}

// deleteFilter matches exactly this binding: every field is set, none is a
// wildcard.
func (p parsedBinding) deleteFilter() kmsg.DeleteACLsRequestFilter {
	f := kmsg.NewDeleteACLsRequestFilter()
	f.ResourceType = p.resType
	f.ResourceName = kmsg.StringPtr(p.name)
	f.ResourcePatternType = p.pattern
	f.Principal = kmsg.StringPtr(p.principal)
	f.Host = kmsg.StringPtr(p.host)
	f.Operation = p.op
	f.PermissionType = p.permission
	return f
}

func describedToBinding(d kadm.DescribedACL) aclBinding {
	return aclBinding{
		Principal:    d.Principal,
		Host:         d.Host,
		ResourceType: enumName(d.Type),
		ResourceName: d.Name,
		PatternType:  enumName(d.Pattern),
		Operation:    enumName(d.Operation),
		Permission:   enumName(d.Permission),
	}
}

func sortBindings(bs []aclBinding) {
	sort.Slice(bs, func(i, j int) bool {
		a, b := bs[i], bs[j]
		for _, pair := range [][2]string{
			{a.Principal, b.Principal},
			{a.ResourceType, b.ResourceType},
			{a.ResourceName, b.ResourceName},
			{a.PatternType, b.PatternType},
			{a.Operation, b.Operation},
			{a.Permission, b.Permission},
			{a.Host, b.Host},
		} {
			if pair[0] != pair[1] {
				return pair[0] < pair[1]
			}
		}
		return false
	})
}

// aclError is a classified ACL failure with a stable code the UI can switch on.
type aclError struct {
	status int
	code   string
	msg    string
}

// classifyACLError maps broker errors that apply to the whole cluster to a
// specific response. It returns nil for errors that belong to a single binding.
func classifyACLError(err error) *aclError {
	switch {
	case errors.Is(err, kerr.SecurityDisabled):
		return &aclError{
			status: http.StatusConflict,
			code:   "security_disabled",
			msg:    "No authorizer is configured on this cluster. Set authorizer.class.name on the brokers to use ACLs.",
		}
	case errors.Is(err, kerr.ClusterAuthorizationFailed):
		return &aclError{
			status: http.StatusForbidden,
			code:   "unauthorized",
			msg:    "This connection's principal is not allowed to manage ACLs. Listing needs Describe on the cluster; creating and deleting need Alter.",
		}
	}
	return nil
}

func writeACLError(w http.ResponseWriter, e *aclError) {
	writeErrorWithFields(w, e.status, e.msg, map[string]any{"code": e.code})
}

// writeACLResults writes per-binding results. When every binding failed with
// the same cluster-wide error (no authorizer, not authorized) it writes that
// classified error instead, so the UI can show one clear message. Any other
// mix is reported per binding, so successes are never hidden.
func writeACLResults(w http.ResponseWriter, results []aclResult, errs []error) {
	var shared *aclError
	for i, err := range errs {
		e := classifyACLError(err)
		if e == nil || (i > 0 && (shared == nil || shared.code != e.code)) {
			shared = nil
			break
		}
		shared = e
	}
	if shared != nil {
		writeACLError(w, shared)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"results": results})
}

// isIAMManaged reports whether the cluster authorizes clients through AWS IAM
// policies rather than Kafka ACLs.
func isIAMManaged(c *config.Cluster) bool {
	return c.Auth != nil && c.Auth.Mechanism == "aws_iam"
}

var iamManagedError = &aclError{
	status: http.StatusConflict,
	code:   "iam_managed",
	msg:    "This connection uses AWS IAM authentication. Access is controlled by IAM policies, not Kafka ACLs.",
}

// aclCluster resolves the cluster, writing the response itself when it is
// missing or authorizes through IAM.
func (h *Handlers) aclCluster(w http.ResponseWriter, r *http.Request) (*config.Cluster, bool) {
	cluster, ok := h.getClusterOrError(w, r)
	if !ok {
		return nil, false
	}
	if isIAMManaged(cluster) {
		writeACLError(w, iamManagedError)
		return nil, false
	}
	return cluster, true
}

// ListACLs godoc
// GET /api/connections/:id/acls
func (h *Handlers) ListACLs(w http.ResponseWriter, r *http.Request) {
	cluster, ok := h.aclCluster(w, r)
	if !ok {
		return
	}
	adm, err := h.pool.get(cluster)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), aclTimeout)
	defer cancel()

	all := kadm.NewACLs().
		AnyResource().
		Allow().AllowHosts().
		Deny().DenyHosts().
		Operations().
		ResourcePatternType(kadm.ACLPatternAny)
	results, err := adm.DescribeACLs(ctx, all)
	if err != nil {
		if e := classifyACLError(err); e != nil {
			writeACLError(w, e)
			return
		}
		writeError(w, http.StatusInternalServerError, "describe acls: "+err.Error())
		return
	}

	bindings := []aclBinding{}
	for _, res := range results {
		if res.Err != nil {
			if e := classifyACLError(res.Err); e != nil {
				writeACLError(w, e)
				return
			}
			writeError(w, http.StatusInternalServerError, "describe acls: "+errMessage(res.Err, res.ErrMessage))
			return
		}
		for _, d := range res.Described {
			bindings = append(bindings, describedToBinding(d))
		}
	}
	sortBindings(bindings)
	writeJSON(w, http.StatusOK, bindings)
}

// decodeBindings reads a batch request body and parses each binding.
func decodeBindings(r *http.Request, parse func(aclBinding) (parsedBinding, error)) ([]parsedBinding, error) {
	var req struct {
		Bindings []aclBinding `json:"bindings"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		return nil, errors.New("invalid request body")
	}
	if len(req.Bindings) == 0 {
		return nil, errors.New("bindings is required")
	}
	parsed := make([]parsedBinding, len(req.Bindings))
	for i, b := range req.Bindings {
		p, err := parse(b)
		if err != nil {
			return nil, fmt.Errorf("binding %d: %w", i+1, err)
		}
		parsed[i] = p
	}
	return parsed, nil
}

func errMessage(err error, extra string) string {
	if extra != "" && !strings.Contains(err.Error(), extra) {
		return err.Error() + ": " + extra
	}
	return err.Error()
}

func codeError(code int16, msg *string) error {
	err := kerr.ErrorForCode(code)
	if err == nil {
		return nil
	}
	if msg != nil && *msg != "" {
		return fmt.Errorf("%w: %s", err, *msg)
	}
	return err
}

// CreateACLs godoc
// POST /api/connections/:id/acls   body: {"bindings": [...]}
//
// All bindings go to the broker in one request; each gets its own result.
func (h *Handlers) CreateACLs(w http.ResponseWriter, r *http.Request) {
	bindings, err := decodeBindings(r, parseNewBinding)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	cluster, ok := h.aclCluster(w, r)
	if !ok {
		return
	}
	cl, err := h.pool.getRaw(cluster)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), aclTimeout)
	defer cancel()

	req := kmsg.NewPtrCreateACLsRequest()
	for _, p := range bindings {
		req.Creations = append(req.Creations, p.creation())
	}
	resp, err := req.RequestWith(ctx, cl)
	if err == nil && len(resp.Results) != len(bindings) {
		err = fmt.Errorf("broker returned %d results for %d bindings", len(resp.Results), len(bindings))
	}
	if err != nil {
		if e := classifyACLError(err); e != nil {
			writeACLError(w, e)
			return
		}
		writeError(w, http.StatusInternalServerError, "create acls: "+err.Error())
		return
	}

	results := make([]aclResult, len(bindings))
	errs := make([]error, len(bindings))
	for i, p := range bindings {
		results[i] = aclResult{aclBinding: p.binding()}
		if errs[i] = codeError(resp.Results[i].ErrorCode, resp.Results[i].ErrorMessage); errs[i] != nil {
			results[i].Error = errs[i].Error()
		}
	}
	writeACLResults(w, results, errs)
}

// DeleteACLs godoc
// POST /api/connections/:id/acls/delete   body: {"bindings": [...]}
//
// Each binding is matched exactly; no field acts as a wildcard. All filters go
// to the broker in one request, and each result counts only the matches the
// broker reports as deleted without error.
func (h *Handlers) DeleteACLs(w http.ResponseWriter, r *http.Request) {
	bindings, err := decodeBindings(r, parseExistingBinding)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	cluster, ok := h.aclCluster(w, r)
	if !ok {
		return
	}
	cl, err := h.pool.getRaw(cluster)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), aclTimeout)
	defer cancel()

	req := kmsg.NewPtrDeleteACLsRequest()
	for _, p := range bindings {
		req.Filters = append(req.Filters, p.deleteFilter())
	}
	resp, err := req.RequestWith(ctx, cl)
	if err == nil && len(resp.Results) != len(bindings) {
		err = fmt.Errorf("broker returned %d results for %d bindings", len(resp.Results), len(bindings))
	}
	if err != nil {
		if e := classifyACLError(err); e != nil {
			writeACLError(w, e)
			return
		}
		writeError(w, http.StatusInternalServerError, "delete acls: "+err.Error())
		return
	}

	results := make([]aclResult, len(bindings))
	errs := make([]error, len(bindings))
	for i, p := range bindings {
		results[i], errs[i] = deleteResult(p, resp.Results[i])
	}
	writeACLResults(w, results, errs)
}

// deleteResult folds a filter's response into one result: the filter error,
// or else the first error on a matched binding, plus the count of matches
// deleted without error.
func deleteResult(p parsedBinding, r kmsg.DeleteACLsResponseResult) (aclResult, error) {
	res := aclResult{aclBinding: p.binding()}
	err := codeError(r.ErrorCode, r.ErrorMessage)
	if err == nil {
		for _, m := range r.MatchingACLs {
			if mErr := codeError(m.ErrorCode, m.ErrorMessage); mErr != nil {
				if err == nil {
					err = mErr
				}
				continue
			}
			res.Deleted++
		}
	}
	if err != nil {
		res.Error = err.Error()
	}
	return res, err
}
