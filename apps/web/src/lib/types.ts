export type Status =
  | "CREATED"
  | "QUEUED"
  | "RUNNING"
  | "PASSED"
  | "FAILED"
  | "ERROR"
  | "CANCELLED"
  | "COMPLETED";
export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export interface AgentVersion {
  id: string;
  agent_id: string;
  version: string;
  model: string;
  model_revision: string | null;
  system_prompt_hash: string;
  configuration_hash: string;
  tool_configuration: string[];
  configuration: Record<string, JsonValue>;
  environment_metadata: Record<string, JsonValue>;
  temperature: number;
  max_tokens: number;
  created_at: string;
}
export interface Agent {
  id: string;
  name: string;
  description: string;
  provider: string;
  status: string;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
  latest_version: string | null;
  versions: AgentVersion[];
}
export interface Task {
  id: string;
  benchmark_version_id: string;
  task_key: string;
  input: string;
  category: string;
  expected_behavior: string[];
  constraints: string[];
  available_tools: string[];
  expected_output: JsonValue;
  evaluation_config: Record<string, JsonValue>;
  task_metadata: Record<string, JsonValue>;
  created_at: string;
}
export interface BenchmarkVersion {
  id: string;
  benchmark_id: string;
  version: string;
  evaluation_rules: Record<string, JsonValue>;
  content_hash: string;
  task_count: number;
  tasks?: Task[];
  created_at: string;
}
export interface Benchmark {
  id: string;
  name: string;
  description: string;
  category: string;
  is_demo: boolean;
  created_at: string;
  latest_version: string;
  versions: BenchmarkVersion[];
}
export interface Metric {
  id: string;
  experiment_id: string;
  key: string;
  value: number | null;
  unit: string;
  numerator: number | null;
  denominator: number | null;
  sample_count: number;
  definition: string;
  formula: string;
  data_source: string;
  direction: "higher" | "lower";
  measured_at: string;
  provenance: Record<string, JsonValue>;
}
export interface Run {
  id: string;
  experiment_id: string;
  task_id: string;
  run_index: number;
  status: Status;
  response_preview: string | null;
  output_hash: string | null;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  task_key: string;
  trace_id: string | null;
  failure_id: string | null;
}
export interface Experiment {
  id: string;
  name: string;
  agent_version_id: string;
  benchmark_version_id: string;
  agent_name: string;
  agent_version: string;
  benchmark_name: string;
  benchmark_version: string;
  provider: string;
  model: string;
  evaluation_version: string;
  configuration_hash: string;
  configuration: Record<string, JsonValue>;
  environment: Record<string, JsonValue>;
  git_commit: string;
  seed: number;
  runs_per_task: number;
  selected_task_ids: string[];
  status: Status;
  is_demo: boolean;
  replay_of_failure_id: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  progress: {
    total: number;
    completed: number;
    counts: Partial<Record<Status, number>>;
  };
  metrics?: Metric[];
  runs?: Run[];
}
export interface TraceEvent {
  id: string;
  trace_id: string;
  sequence: number;
  timestamp: string;
  offset_ms: number;
  duration_ms: number | null;
  event_type: string;
  tool_name: string | null;
  status: string;
  input_metadata: Record<string, JsonValue>;
  output_metadata: Record<string, JsonValue>;
  error: string | null;
}
export interface ToolCall {
  id: string;
  trace_id: string;
  run_id: string;
  event_sequence: number;
  tool_name: string;
  arguments: Record<string, JsonValue>;
  status: string;
  duration_ms: number;
  argument_valid: boolean | null;
  selection_valid: boolean | null;
  result?: { output: Record<string, JsonValue>; error: string | null } | null;
}
export interface Trace {
  id: string;
  experiment_id: string;
  run_id: string;
  task_id: string;
  task_key: string;
  task_input: string | null;
  run_status: Status;
  run_index: number;
  duration_ms: number | null;
  created_at: string;
  events?: TraceEvent[];
  tool_calls?: ToolCall[];
}
export interface Failure {
  id: string;
  run_id: string;
  trace_id: string;
  experiment_id: string;
  task_id: string;
  agent_version_id: string;
  agent_name: string;
  agent_version: string;
  task_key: string;
  task_input: string | null;
  failure_type: string;
  severity: string;
  status: string;
  summary: string;
  expected: Record<string, JsonValue>;
  observed: Record<string, JsonValue>;
  evidence: Record<string, JsonValue>;
  reproduction_config: Record<string, JsonValue>;
  detected_at: string;
  first_seen: string;
  last_seen: string;
  is_demo: boolean;
  frequency?: {
    failures: number;
    runs: number;
    first_seen: string;
    last_seen: string;
  };
  reproductions?: {
    id: string;
    experiment_id: string;
    outcome: string;
    reason: string;
    experiment_status: string;
    created_at: string;
    completed_at: string | null;
  }[];
}
export interface Regression {
  id: string;
  baseline_experiment_id: string;
  candidate_experiment_id: string;
  comparator_version: string;
  comparable: boolean;
  verdict: string;
  reasons: string[];
  new_failures: {
    task_key: string;
    run_index: number;
    baseline_run_id: string;
    candidate_run_id: string;
  }[];
  resolved_failures: { task_key: string; run_index: number }[];
  persistent_failures: { task_key: string; run_index: number }[];
  deltas: Record<
    string,
    { baseline: number | null; candidate: number | null; delta: number | null }
  >;
  created_at: string;
}
export interface ReportListItem {
  id: string;
  title: string;
  is_demo: boolean;
  experiment_id: string;
  created_at: string;
}
export interface ReportDetail extends ReportListItem {
  content_json: Record<string, JsonValue>;
  content_markdown: string;
}
export interface Overview {
  latest_experiment: Experiment | null;
  recent_experiments: Experiment[];
  counts: {
    agents: number;
    benchmarks: number;
    experiments: number;
    failures: number;
    traces: number;
  };
  message: string | null;
}
export interface MetricDefinition {
  key: string;
  definition: string;
  formula: string;
  unit: string;
  direction: string;
  data_source: string;
}
export interface Catalog {
  notice: string;
  templates: {
    name: string;
    category: string;
    description: string;
    version: string;
    evaluation_rules: Record<string, JsonValue>;
    tasks: {
      task_key: string;
      category: string;
      input: string;
      expected_output: JsonValue;
      available_tools: string[];
      evaluation_config: Record<string, JsonValue>;
      metadata: Record<string, JsonValue>;
    }[];
  }[];
}
