import { usernamePlan } from "@/server/ai/fixtures/username-plan";

export function wirePlan() {
  return {
    summary: usernamePlan.summary, risks: [...usernamePlan.risks], questions: [...usernamePlan.questions],
    checks: usernamePlan.checks.map((check) => ({
      id: check.id, position: check.position, type: check.type, title: check.title,
      steps: [...check.steps], testData: [...check.testData], expectedResult: check.expectedResult,
      reason: check.reason, basis: check.basis, sourceRefs: [],
    })),
  };
}

export function responseBody(plan: unknown = wirePlan(), status = "completed") {
  return {
    id: "resp_mock", object: "response", created_at: 1, status,
    error: null, incomplete_details: status === "incomplete" ? { reason: "max_output_tokens" } : null,
    output: [{ id: "msg_mock", type: "message", role: "assistant", status: "completed",
      content: [{ type: "output_text", text: JSON.stringify(plan), annotations: [] }] }],
  };
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
