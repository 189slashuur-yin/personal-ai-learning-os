export type NoteEditorState = {
  mode: "preview" | "editing";
  savedValue: string;
  draftValue: string;
};

export function createNoteEditorState(value = ""): NoteEditorState {
  return { mode: "preview", savedValue: value, draftValue: value };
}

export function beginNoteEditing(state: NoteEditorState): NoteEditorState {
  return { ...state, mode: "editing", draftValue: state.savedValue };
}

export function updateNoteDraft(
  state: NoteEditorState,
  draftValue: string,
): NoteEditorState {
  return { ...state, draftValue };
}

export function cancelNoteEditing(state: NoteEditorState): NoteEditorState {
  return {
    mode: "preview",
    savedValue: state.savedValue,
    draftValue: state.savedValue,
  };
}

export function saveNoteEditing(state: NoteEditorState): NoteEditorState {
  return {
    mode: "preview",
    savedValue: state.draftValue,
    draftValue: state.draftValue,
  };
}

export function getNoteEditorVisibility(mode: NoteEditorState["mode"]): {
  showPreview: boolean;
  showEditor: boolean;
} {
  return {
    showPreview: mode === "preview",
    showEditor: mode === "editing",
  };
}
