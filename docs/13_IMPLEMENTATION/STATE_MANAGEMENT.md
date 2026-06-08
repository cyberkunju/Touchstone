# State Management — Edge DocGraph Engine

**Purpose:** Define app state, graph state, form state, viewer state, worker state, runtime state, template state, correction state, and persistence boundaries.

---

## 1. State principle

The app must not treat form state as truth.

Truth hierarchy:

```text
Original document artifacts
  → EvidenceRecords
  → DocGraph
  → Verifier results
  → Form projection/view model
  → UI controls
```

Form fields are editable views over DocGraph, not independent truth.

---

## 2. State categories

```text
AppState
DocumentState
GraphState
FormState
ViewerState
WorkerState
RuntimeState
TemplateState
CorrectionState
StorageState
SecurityState
```

Each has a clear owner.

---

## 3. AppState

Global app-level state.

```ts
type AppState = {
  activeDocumentId: DocumentId | null;
  activeWorkspaceMode: WorkspaceMode;
  runtimeCapabilities: RuntimeCapabilities;
  userPreferences: UserPreferences;
  featureFlags: FeatureFlags;
};
```

Should be small.

Do not put full DocGraph or image buffers directly in global UI state.

---

## 4. DocumentState

Tracks currently loaded document.

```ts
type DocumentState = {
  documentId: DocumentId;
  fileName?: string;
  pages: PageSummary[];
  status: DocumentProcessingStatus;
  qualitySummary?: DocumentQualitySummary;
};
```

---

## 5. GraphState

GraphState is the current DocGraph and patches.

Recommended:

```ts
type GraphState = {
  documentId: DocumentId;
  graphVersion: number;
  docGraph: DocGraph;
  pendingPatches: DocGraphPatch[];
  lastSavedPatchId?: string;
};
```

For large documents, use:

- graph store
- selectors
- incremental patches
- normalized maps

Avoid replacing huge graph object unnecessarily.

---

## 6. FormState

FormState is projection.

```ts
type FormState = {
  documentId: DocumentId;
  formSchema: FormSchema;
  formValues: Record<FieldId, FormFieldViewModel>;
  filters: FormFilter;
  reviewQueue: ReviewIssue[];
  selectedFieldId: FieldId | null;
};
```

FormState is derived from:

- DocGraph
- FieldHypotheses
- ValidationResults
- TemplateGraph context

User edits dispatch correction commands, not direct arbitrary mutations.

---

## 7. ViewerState

Viewer state is UI-only.

```ts
type ViewerState = {
  selectedPageId: PageId | null;
  zoom: number;
  pan: { x: number; y: number };
  selectedRegionId?: string;
  activeOverlayLayers: OverlayLayer[];
  editMode?: RegionEditMode;
};
```

ViewerState must not own extraction truth.

Region edits become correction events and graph patches.

---

## 8. WorkerState

Worker state tracks jobs/tasks.

```ts
type WorkerState = {
  jobs: Record<JobId, JobView>;
  activeJobId?: JobId;
  progressByTask: Record<TaskId, TaskProgress>;
  errors: RuntimeError[];
};
```

WorkerState should be updated from typed worker events.

---

## 9. RuntimeState

Runtime state tracks model/session/cache status.

```ts
type RuntimeState = {
  models: Record<ModelId, ModelLoadState>;
  runtimeMode: "webgpu" | "wasm" | "native";
  memoryWarnings: MemoryWarning[];
  capabilities: RuntimeCapabilities;
};
```

No raw tensors in state.

---

## 10. TemplateState

```ts
type TemplateState = {
  matchedTemplateId?: TemplateId;
  templateDecision?: TemplateDecision;
  availableTemplates: TemplateSummary[];
  draftTemplate?: TemplateDraft;
  saveEligibility: TemplateSaveEligibility;
};
```

TemplateState should reflect decisions but TemplateGraph lives in template store/domain.

---

## 11. CorrectionState

```ts
type CorrectionState = {
  pendingCorrection?: CorrectionDraft;
  correctionHistory: CorrectionEventSummary[];
  undoStack: CorrectionEvent[];
  redoStack: CorrectionEvent[];
};
```

Correction history can be stored in DocGraph/storage, with UI summaries in state.

---

## 12. StorageState

Tracks persistence.

```ts
type StorageState = {
  saving: boolean;
  lastSavedAt?: number;
  quotaWarning?: StorageQuotaWarning;
  encryptionStatus: EncryptionStatus;
};
```

---

## 13. State management library

The project can use:

- Zustand
- Redux Toolkit
- Jotai
- custom event store

Selection criteria:

- TypeScript strictness
- selector support
- minimal boilerplate
- good devtools without leaking sensitive values
- compatibility with large graphs
- easy testing

Important: devtools must not expose sensitive values by default.

---

## 14. Command pattern

User actions should dispatch commands.

Examples:

```ts
type AppCommand =
  | { type: "upload_document"; file: File }
  | { type: "select_field"; fieldId: FieldId }
  | { type: "edit_field_value"; fieldId: FieldId; value: string }
  | { type: "redraw_region"; fieldId: FieldId; box: NormalizedBox }
  | { type: "resolve_conflict"; conflictId: ConflictId; choice: ConflictChoice }
  | { type: "save_template"; decision: TemplateSaveDecision };
```

Commands produce:

- graph patches
- worker tasks
- UI updates
- storage writes

---

## 15. Derived selectors

Use selectors for:

- visible fields
- review queue
- field status counts
- evidence for selected field
- overlays for selected page
- export readiness
- template save eligibility

Avoid recomputing large projections every render.

---

## 16. Persistence boundaries

Persist:

- DocGraph
- TemplateGraph
- corrections
- artifacts
- settings
- model cache index

Do not persist:

- UI zoom/pan unless user preference
- raw temporary tensors
- worker internal queues after task ends
- transient crop buffers
- debug logs with values

---

## 17. Sensitive devtools rule

If using state devtools:

- disable in production,
- redact sensitive values,
- avoid storing raw OCR in global devtools state,
- provide safe graph inspector.

---

## 18. State update flow after correction

```text
user edits field
  → command
  → CorrectionEvent
  → DocGraphPatch
  → affected validators rerun
  → FieldHypothesis status updated
  → FormState re-derived
  → TemplateSaveEligibility updated
```

---

## 19. Race condition rules

Handle:

- stale worker results after cancellation,
- user edits while extraction running,
- template match result arriving after user chose new template,
- repeated upload replacing active document,
- storage save conflict.

Use job IDs and graph version IDs.

---

## 20. Final state rule

DocGraph is the extraction truth. FormState is a view. ViewerState is interaction. WorkerState is progress. StorageState is persistence. Mixing these creates bugs, leaks, and template corruption.
