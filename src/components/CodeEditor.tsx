import { useEffect, useRef } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { python } from '@codemirror/lang-python';
import { syntaxHighlighting, HighlightStyle, indentOnInput, bracketMatching, foldKeymap } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import type { RoboExxTheme } from '../themes/types';

interface Props {
  value: string;
  onChange: (code: string) => void;
  theme: RoboExxTheme;
}

/**
 * CodeMirror 6 tabanlı MicroPython kod editörü.
 * Tema değiştiğinde renkler de yenilenir.
 */
export function CodeEditor({ value, onChange, theme }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartment = useRef(new Compartment());
  const externalValue = useRef(value);

  // İlk yüklemede editörü kur
  useEffect(() => {
    if (!hostRef.current) return;

    const startState = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        history(),
        indentOnInput(),
        bracketMatching(),
        keymap.of([...defaultKeymap, ...historyKeymap, ...foldKeymap, indentWithTab]),
        python(),
        themeCompartment.current.of(buildCmExtensions(theme)),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const newValue = update.state.doc.toString();
            externalValue.current = newValue;
            onChange(newValue);
          }
        }),
      ],
    });

    const view = new EditorView({ state: startState, parent: hostRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tema değiştiğinde reconfigure
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: themeCompartment.current.reconfigure(buildCmExtensions(theme)),
    });
  }, [theme]);

  // Dışarıdan value değiştiğinde (örn. blok modundan dönüşte) editörü güncelle
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (value !== externalValue.current) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
      });
      externalValue.current = value;
    }
  }, [value]);

  return <div ref={hostRef} className="code-editor-host" />;
}

/** CodeMirror tema + syntax highlight extension'larını üret */
function buildCmExtensions(theme: RoboExxTheme) {
  const cm = theme.codemirror;

  const editorTheme = EditorView.theme(
    {
      '&': {
        height: '100%',
        fontSize: '14px',
        fontFamily: 'JetBrains Mono, Fira Code, Consolas, monospace',
        backgroundColor: cm.background,
        color: cm.foreground,
      },
      '.cm-content': {
        caretColor: cm.cursor,
        padding: '12px 0',
      },
      '.cm-cursor, .cm-dropCursor': { borderLeftColor: cm.cursor, borderLeftWidth: '2px' },
      '&.cm-focused .cm-selectionBackground, ::selection, .cm-selectionBackground': {
        backgroundColor: cm.selection + ' !important',
      },
      '.cm-activeLine': { backgroundColor: cm.lineHighlight },
      '.cm-activeLineGutter': { backgroundColor: cm.lineHighlight, color: cm.gutterActive },
      '.cm-gutters': {
        backgroundColor: cm.gutterBg,
        color: cm.gutterText,
        border: 'none',
        paddingRight: '8px',
      },
      '.cm-scroller': { fontFamily: 'JetBrains Mono, Fira Code, Consolas, monospace' },
      '.cm-line': { padding: '0 16px' },
    },
    { dark: true }
  );

  const highlightStyle = HighlightStyle.define([
    { tag: t.keyword, color: cm.keyword, fontWeight: '600' },
    { tag: [t.controlKeyword, t.modifier], color: cm.keyword, fontWeight: '600' },
    { tag: [t.string, t.special(t.string)], color: cm.string },
    { tag: t.number, color: cm.number },
    { tag: [t.comment, t.lineComment, t.blockComment], color: cm.comment, fontStyle: 'italic' },
    { tag: [t.function(t.variableName), t.function(t.propertyName)], color: cm.function },
    { tag: t.operator, color: cm.operator },
    { tag: [t.standard(t.variableName), t.bool, t.null], color: cm.builtin },
    { tag: t.variableName, color: cm.foreground },
    { tag: t.propertyName, color: cm.foreground },
    { tag: t.punctuation, color: cm.operator },
  ]);

  return [editorTheme, syntaxHighlighting(highlightStyle)];
}
