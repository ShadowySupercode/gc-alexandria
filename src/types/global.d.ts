interface Window {
  hljs?: {
    highlightAll: () => void;
  };
  MathJax?: {
    typesetPromise: () => Promise<void>;
  };
}
