# Evaluations

Run `npm run eval` for adversarial fixtures or `npm run test` for the complete deterministic suite.

Current fixtures cover prompt injection, permission escalation, false commitment, firm commitment, conditional promise, workspace leakage, superseded decisions, unsupported claims, duplicate execution, approval bypass, connector mapping, and bounded context.

Release-gating metrics are workspace-leakage rate, approval-bypass rate, and duplicate-side-effect rate—all required to remain zero in automated fixtures. Product metrics to collect with consent are commitment/decision extraction precision, citation completeness, unsupported-claim rate, brief usefulness, user edit distance, meeting-prep acceptance, and cost per completed workflow.

Add a case by encoding the untrusted input, expected structured candidate, allowed tools, workspace, truth state, and expected audit result. Never use real confidential content in the fixture repository.
