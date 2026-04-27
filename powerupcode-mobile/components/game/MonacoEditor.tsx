import React, { useRef } from "react";
import { StyleSheet } from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";

interface MonacoEditorProps {
  language: string;
  value: string;
  onChange: (code: string) => void;
  height?: number;
}

function buildHtml(language: string, value: string): string {
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$/g, "\\$");

  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; background: #0f0f0f; overflow: hidden; }
  #container { width: 100%; height: 100%; }
</style>
</head>
<body>
<div id="container"></div>
<script src="https://cdn.jsdelivr.net/npm/monaco-editor@0.49.0/min/vs/loader.js"></script>
<script>
  require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.49.0/min/vs' } });
  require(['vs/editor/editor.main'], function () {
    var editor = monaco.editor.create(document.getElementById('container'), {
      value: \`${escaped}\`,
      language: '${language}',
      theme: 'vs-dark',
      fontSize: 13,
      minimap: { enabled: false },
      lineNumbers: 'on',
      scrollBeyondLastLine: false,
      automaticLayout: true,
      wordWrap: 'on',
      padding: { top: 8, bottom: 8 },
    });
    editor.onDidChangeModelContent(function () {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'change', code: editor.getValue() }));
    });
  });
</script>
</body>
</html>`;
}

export default function MonacoEditor({
  language,
  value,
  onChange,
  height = 320,
}: MonacoEditorProps) {
  const html = buildHtml(language, value);

  function handleMessage(event: WebViewMessageEvent) {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === "change") onChange(data.code);
    } catch {}
  }

  return (
    <WebView
      style={[styles.editor, { height }]}
      source={{ html }}
      onMessage={handleMessage}
      javaScriptEnabled
      originWhitelist={["*"]}
      scrollEnabled={false}
    />
  );
}

const styles = StyleSheet.create({
  editor: {
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#0f0f0f",
  },
});
