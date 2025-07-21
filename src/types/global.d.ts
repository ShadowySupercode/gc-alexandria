interface Window {
  hljs?: {
    highlightAll: () => void;
  };
  MathJax?: {
    typesetPromise: () => Promise<void>;
  };
}

declare global {
  var MathJax: {
    typesetPromise: () => Promise<void>;
  } | undefined;
  
  interface GlobalThis {
    MathJax?: {
      typesetPromise: () => Promise<void>;
    };
  }
}
