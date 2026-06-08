# Configuration — Edge DocGraph Engine

**Purpose:** Define model paths, thresholds, feature flags, experiment switches, runtime profiles, config schemas, validation, and safe configuration rules.

---

## 1. Configuration principle

Configuration must be:

- typed
- validated
- versioned
- environment-aware
- safe by default
- auditable
- not a dumping ground for magic values

Threshold changes can affect silent error rate, so they must be tracked.

---

## 2. Config categories

```text
model config
runtime config
pipeline config
threshold config
feature flags
experiment switches
security/privacy config
storage config
UI config
benchmark config
```

---

## 3. Config schema

Use typed schema.

```ts
type AppConfig = {
  version: string;
  models: ModelConfig;
  runtime: RuntimeConfig;
  pipeline: PipelineConfig;
  thresholds: ThresholdConfig;
  features: FeatureFlags;
  security: SecurityConfig;
  storage: StorageConfig;
};
```

Validate config at startup.

---

## 4. Model config

```ts
type ModelConfig = {
  detector: ModelSpec;
  ocr: {
    detector?: ModelSpec;
    recognizer: ModelSpec;
    classifier?: ModelSpec;
  };
  segmentation?: ModelSpec;
  table?: ModelSpec;
};

type ModelSpec = {
  id: ModelId;
  version: string;
  path: string;
  checksum?: string;
  runtime: "onnxruntime-web" | "native" | "wasm";
  task: string;
};
```

---

## 5. Runtime config

```ts
type RuntimeConfig = {
  preferredExecutionProvider: "webgpu" | "wasm" | "native";
  allowedExecutionProviders: Array<"webgpu" | "wasm" | "native">;
  maxParallelPages: number;
  workerCount: number;
  ocrBatchSize: number;
  enableOffscreenCanvas: boolean;
};
```

Runtime config may adapt by device class.

---

## 6. Threshold config

```ts
type ThresholdConfig = {
  detection: Record<string, number>;
  ocr: {
    confirmedMin: number;
    reviewMin: number;
  };
  template: {
    sameTemplateMin: number;
    newVersionMin: number;
    unknownBelow: number;
  };
  verifier: {
    criticalFieldMinConfidence: number;
    allowAmbiguousDates: boolean;
  };
};
```

Thresholds must be benchmarked.

Do not lower thresholds just to improve demos.

---

## 7. Feature flags

```ts
type FeatureFlags = {
  enableSegmentationBucket: boolean;
  enableTableModelBucket: boolean;
  enableHeavyModelResearchBucket: boolean;
  enableTauriNativeInference: boolean;
  enableEncryptedStorage: boolean;
  enableUnsafeDebugMode: boolean;
};
```

Feature flags must default safe.

---

## 8. Experiment switches

Experiments are not production features.

Example:

```ts
type ExperimentConfig = {
  id: string;
  enabled: boolean;
  owner: string;
  expiresAt?: string;
  decisionLogRef?: string;
};
```

Experiments must have:

- owner
- purpose
- benchmark plan
- expiry/review
- no silent activation in release.

---

## 9. Security/privacy config

```ts
type SecurityConfig = {
  noCloudMode: true;
  telemetryEnabled: false;
  encryptSensitiveStorage: boolean;
  allowUnsafeDebugExport: boolean;
  allowTemplateImport: boolean;
};
```

No-cloud mode should not be disabled in default builds.

---

## 10. Storage config

```ts
type StorageConfig = {
  documentRetentionDefault: "session_only" | "persist_until_user_deletes";
  useOpfs: boolean;
  useIndexedDb: boolean;
  maxCacheBytes?: number;
  tempCleanupOnStartup: boolean;
};
```

---

## 11. UI config

```ts
type UiConfig = {
  showDeveloperMode: boolean;
  defaultEvidenceMode: "summary" | "detailed";
  defaultExportMode: "with_statuses" | "confirmed_only";
  statusColorsTheme: string;
};
```

---

## 12. Environment handling

Environment files must not contain secrets.

Allowed:

- build mode
- model base URL
- docs URL
- feature preview flags

Forbidden:

- API keys
- secrets
- private model credentials
- telemetry tokens unless opt-in system exists and safely handled.

---

## 13. Config loading order

Recommended:

```text
hardcoded safe defaults
  → build-time config
  → local user settings
  → runtime device profile adjustments
```

Do not allow remote config to silently change extraction thresholds in a privacy-sensitive app.

---

## 14. Config versioning

Every config includes version.

Changes to:

- thresholds
- model IDs
- validators
- template matching scores
- export behavior

must be documented in decision log/release notes.

---

## 15. Config validation

At startup:

- schema valid,
- model paths valid,
- thresholds in safe ranges,
- required features available,
- no-cloud policy not disabled,
- experiment flags allowed for build type.

Invalid config should block unsafe operation.

---

## 16. Test config

Tests should use explicit config fixtures:

```text
config/test/base.json
config/test/no_cloud.json
config/test/low_device.json
config/test/known_template.json
```

Never let tests depend on developer local config silently.

---

## 17. Final config rule

Configuration can change product behavior as much as code. Treat thresholds, model paths, feature flags, and security settings as audited engineering decisions, not casual constants.
