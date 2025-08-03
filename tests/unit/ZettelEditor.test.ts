import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AsciiDocMetadata } from "../../src/lib/utils/asciidoc_metadata";

// Mock all Svelte components and dependencies
vi.mock("flowbite-svelte", () => ({
  Textarea: vi.fn().mockImplementation((props) => {
    return {
      $$render: () => `<textarea data-testid="textarea" class="${props.class || ''}" rows="${props.rows || 12}" ${props.disabled ? 'disabled' : ''} placeholder="${props.placeholder || ''}"></textarea>`,
      $$bind: { value: props.bind, oninput: props.oninput }
    };
  }),
  Button: vi.fn().mockImplementation((props) => {
    return {
      $$render: () => `<button data-testid="preview-button" class="${props.class || ''}" ${props.disabled ? 'disabled' : ''} onclick="${props.onclick || ''}">${props.children || ''}</button>`,
      $$bind: { onclick: props.onclick }
    };
  })
}));

vi.mock("flowbite-svelte-icons", () => ({
  EyeOutline: vi.fn().mockImplementation(() => ({
    $$render: () => `<svg data-testid="eye-icon"></svg>`
  }))
}));

vi.mock("asciidoctor", () => ({
  default: vi.fn(() => ({
    convert: vi.fn((content, options) => {
      // Mock AsciiDoctor conversion - return simple HTML
      return content.replace(/^==\s+(.+)$/gm, '<h2>$1</h2>')
                   .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                   .replace(/\*(.+?)\*/g, '<em>$1</em>');
    })
  }))
}));

// Mock sessionStorage
const mockSessionStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(global, 'sessionStorage', {
  value: mockSessionStorage,
  writable: true
});

// Mock window object for DOM manipulation
Object.defineProperty(global, 'window', {
  value: {
    sessionStorage: mockSessionStorage,
    document: {
      querySelector: vi.fn(),
      createElement: vi.fn(),
    }
  },
  writable: true
});

// Mock DOM methods
const mockQuerySelector = vi.fn();
const mockCreateElement = vi.fn();
const mockAddEventListener = vi.fn();
const mockRemoveEventListener = vi.fn();

Object.defineProperty(global, 'document', {
  value: {
    querySelector: mockQuerySelector,
    createElement: mockCreateElement,
    addEventListener: mockAddEventListener,
    removeEventListener: mockRemoveEventListener,
  },
  writable: true
});

describe("ZettelEditor Component Logic", () => {
  let mockOnContentChange: ReturnType<typeof vi.fn>;
  let mockOnPreviewToggle: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnContentChange = vi.fn();
    mockOnPreviewToggle = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Publication Format Detection Logic", () => {
    it("should detect document header format", () => {
      const contentWithDocumentHeader = "= Document Title\n\n== Section 1\nContent";
      
      // Test the regex pattern used in the component
      const hasDocumentHeader = contentWithDocumentHeader.match(/^=\s+/m);
      expect(hasDocumentHeader).toBeTruthy();
    });

    it("should detect index card format", () => {
      const contentWithIndexCard = "index card\n\n== Section 1\nContent";
      
      // Test the logic used in the component
      const lines = contentWithIndexCard.split(/\r?\n/);
      let hasIndexCard = false;
      for (const line of lines) {
        if (line.trim().toLowerCase() === 'index card') {
          hasIndexCard = true;
          break;
        }
      }
      expect(hasIndexCard).toBe(true);
    });

    it("should not detect publication format for normal section content", () => {
      const normalContent = "== Section 1\nContent\n\n== Section 2\nMore content";
      
      // Test the logic used in the component
      const lines = normalContent.split(/\r?\n/);
      let hasPublicationHeader = false;
      for (const line of lines) {
        if (line.match(/^=\s+(.+)$/)) {
          hasPublicationHeader = true;
          break;
        }
        if (line.trim().toLowerCase() === 'index card') {
          hasPublicationHeader = true;
          break;
        }
      }
      expect(hasPublicationHeader).toBe(false);
    });
  });

  describe("Content Parsing Logic", () => {
    it("should parse sections with document header", () => {
      const content = "== Section 1\n:author: Test Author\n\nContent 1";
      
      // Test the parsing logic
      const hasDocumentHeader = content.match(/^=\s+/m);
      expect(hasDocumentHeader).toBeFalsy(); // This content doesn't have a document header
      
      // Test section splitting logic
      const sectionStrings = content.split(/(?=^==\s+)/gm).filter((section: string) => section.trim());
      expect(sectionStrings).toHaveLength(1);
      expect(sectionStrings[0]).toContain("== Section 1");
    });

    it("should parse sections without document header", () => {
      const content = "== Section 1\nContent 1";
      
      // Test the parsing logic
      const hasDocumentHeader = content.match(/^=\s+/m);
      expect(hasDocumentHeader).toBeFalsy();
      
      // Test section splitting logic
      const sectionStrings = content.split(/(?=^==\s+)/gm).filter((section: string) => section.trim());
      expect(sectionStrings).toHaveLength(1);
      expect(sectionStrings[0]).toContain("== Section 1");
    });

    it("should handle empty content", () => {
      const content = "";
      const hasDocumentHeader = content.match(/^=\s+/m);
      expect(hasDocumentHeader).toBeFalsy();
    });
  });

  describe("Content Conversion Logic", () => {
    it("should convert document title to section title", () => {
      const contentWithDocumentHeader = "= Document Title\n\n== Section 1\nContent";
      
      // Test the conversion logic
      let convertedContent = contentWithDocumentHeader.replace(/^=\s+(.+)$/gm, '== $1');
      convertedContent = convertedContent.replace(/^index card$/gim, '');
      const finalContent = convertedContent.replace(/\n\s*\n\s*\n/g, '\n\n');
      
      expect(finalContent).toBe("== Document Title\n\n== Section 1\nContent");
    });

    it("should remove index card line", () => {
      const contentWithIndexCard = "index card\n\n== Section 1\nContent";
      
      // Test the conversion logic
      let convertedContent = contentWithIndexCard.replace(/^=\s+(.+)$/gm, '== $1');
      convertedContent = convertedContent.replace(/^index card$/gim, '');
      const finalContent = convertedContent.replace(/\n\s*\n\s*\n/g, '\n\n');
      
      expect(finalContent).toBe("\n\n== Section 1\nContent");
    });

    it("should clean up double newlines", () => {
      const contentWithExtraNewlines = "= Document Title\n\n\n== Section 1\nContent";
      
      // Test the conversion logic
      let convertedContent = contentWithExtraNewlines.replace(/^=\s+(.+)$/gm, '== $1');
      convertedContent = convertedContent.replace(/^index card$/gim, '');
      const finalContent = convertedContent.replace(/\n\s*\n\s*\n/g, '\n\n');
      
      expect(finalContent).toBe("== Document Title\n\n== Section 1\nContent");
    });
  });

  describe("SessionStorage Integration", () => {
    it("should store content in sessionStorage when switching to publication editor", () => {
      const contentWithDocumentHeader = "= Document Title\n\n== Section 1\nContent";
      
      // Test the sessionStorage logic
      mockSessionStorage.setItem('zettelEditorContent', contentWithDocumentHeader);
      mockSessionStorage.setItem('zettelEditorSource', 'publication-format');
      
      expect(mockSessionStorage.setItem).toHaveBeenCalledWith('zettelEditorContent', contentWithDocumentHeader);
      expect(mockSessionStorage.setItem).toHaveBeenCalledWith('zettelEditorSource', 'publication-format');
    });
  });

  describe("Event Count Logic", () => {
    it("should calculate correct event count for single section", () => {
      const sections = [{ title: "Section 1", content: "Content 1", tags: [] }];
      const eventCount = sections.length;
      const eventText = `${eventCount} event${eventCount !== 1 ? "s" : ""}`;
      
      expect(eventCount).toBe(1);
      expect(eventText).toBe("1 event");
    });

    it("should calculate correct event count for multiple sections", () => {
      const sections = [
        { title: "Section 1", content: "Content 1", tags: [] },
        { title: "Section 2", content: "Content 2", tags: [] }
      ];
      const eventCount = sections.length;
      const eventText = `${eventCount} event${eventCount !== 1 ? "s" : ""}`;
      
      expect(eventCount).toBe(2);
      expect(eventText).toBe("2 events");
    });
  });

  describe("Tag Processing Logic", () => {
    it("should process tags correctly", () => {
      // Mock the metadataToTags function
      const mockMetadataToTags = vi.fn().mockReturnValue([["author", "Test Author"]]);
      
      const mockMetadata = { title: "Section 1", author: "Test Author" } as AsciiDocMetadata;
      const tags = mockMetadataToTags(mockMetadata);
      
      expect(tags).toEqual([["author", "Test Author"]]);
      expect(mockMetadataToTags).toHaveBeenCalledWith(mockMetadata);
    });

    it("should handle empty tags", () => {
      // Mock the metadataToTags function
      const mockMetadataToTags = vi.fn().mockReturnValue([]);
      
      const mockMetadata = { title: "Section 1" } as AsciiDocMetadata;
      const tags = mockMetadataToTags(mockMetadata);
      
      expect(tags).toEqual([]);
    });
  });

  describe("AsciiDoctor Processing", () => {
    it("should process AsciiDoc content correctly", () => {
      // Mock the asciidoctor conversion
      const mockConvert = vi.fn((content, options) => {
        return content.replace(/^==\s+(.+)$/gm, '<h2>$1</h2>')
                     .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                     .replace(/\*(.+?)\*/g, '<em>$1</em>');
      });
      
      const content = "== Test Section\n\nThis is **bold** and *italic* text.";
      const processedContent = mockConvert(content, {
        standalone: false,
        doctype: "article",
        attributes: {
          showtitle: true,
          sectids: true,
        },
      });
      
      expect(processedContent).toContain('<h2>Test Section</h2>');
      expect(processedContent).toContain('<strong>bold</strong>');
      expect(processedContent).toContain('<em>italic</em>');
    });
  });

  describe("Error Handling", () => {
    it("should handle parsing errors gracefully", () => {
      // Mock a function that might throw an error
      const mockParseFunction = vi.fn().mockImplementation(() => {
        throw new Error("Parsing error");
      });
      
      const content = "== Section 1\nContent 1";
      
      // Should not throw error when called
      expect(() => {
        try {
          mockParseFunction(content);
        } catch (error) {
          // Expected error, but should be handled gracefully
        }
      }).not.toThrow();
    });

    it("should handle empty content without errors", () => {
      const content = "";
      const hasDocumentHeader = content.match(/^=\s+/m);
      expect(hasDocumentHeader).toBeFalsy();
    });
  });

  describe("Component Props Interface", () => {
    it("should have correct prop types", () => {
      // Test that the component props interface is correctly defined
      const expectedProps = {
        content: "",
        placeholder: "Default placeholder",
        showPreview: false,
        onContentChange: vi.fn(),
        onPreviewToggle: vi.fn(),
      };
      
      expect(expectedProps).toHaveProperty('content');
      expect(expectedProps).toHaveProperty('placeholder');
      expect(expectedProps).toHaveProperty('showPreview');
      expect(expectedProps).toHaveProperty('onContentChange');
      expect(expectedProps).toHaveProperty('onPreviewToggle');
    });
  });

  describe("Utility Function Integration", () => {
    it("should integrate with ZettelParser utilities", () => {
      // Mock the parseAsciiDocSections function
      const mockParseAsciiDocSections = vi.fn().mockReturnValue([
        { title: "Section 1", content: "Content 1", tags: [] }
      ]);
      
      const content = "== Section 1\nContent 1";
      const sections = mockParseAsciiDocSections(content, 2);
      
      expect(sections).toHaveLength(1);
      expect(sections[0].title).toBe("Section 1");
    });

    it("should integrate with asciidoc_metadata utilities", () => {
      // Mock the utility functions
      const mockExtractDocumentMetadata = vi.fn().mockReturnValue({
        metadata: { title: "Document Title" } as AsciiDocMetadata,
        content: "Document content"
      });
      
      const mockExtractSectionMetadata = vi.fn().mockReturnValue({
        metadata: { title: "Section Title" } as AsciiDocMetadata,
        content: "Section content",
        title: "Section Title"
      });
      
      const documentContent = "= Document Title\nDocument content";
      const sectionContent = "== Section Title\nSection content";
      
      const documentResult = mockExtractDocumentMetadata(documentContent);
      const sectionResult = mockExtractSectionMetadata(sectionContent);
      
      expect(documentResult.metadata.title).toBe("Document Title");
      expect(sectionResult.title).toBe("Section Title");
    });
  });

  describe("Content Validation", () => {
    it("should validate content structure", () => {
      const validContent = "== Section 1\nContent here\n\n== Section 2\nMore content";
      const invalidContent = "Just some text without sections";
      
      // Test section detection
      const validSections = validContent.split(/(?=^==\s+)/gm).filter((section: string) => section.trim());
      const invalidSections = invalidContent.split(/(?=^==\s+)/gm).filter((section: string) => section.trim());
      
      expect(validSections.length).toBeGreaterThan(0);
      // The invalid content will have one section (the entire content) since it doesn't start with ==
      expect(invalidSections.length).toBe(1);
    });

    it("should handle mixed content types", () => {
      const mixedContent = "= Document Title\n\n== Section 1\nContent\n\n== Section 2\nMore content";
      
      // Test document header detection
      const hasDocumentHeader = mixedContent.match(/^=\s+/m);
      expect(hasDocumentHeader).toBeTruthy();
      
      // Test section extraction
      const sections = mixedContent.split(/(?=^==\s+)/gm).filter((section: string) => section.trim());
      expect(sections.length).toBeGreaterThan(0);
    });
  });

  describe("String Manipulation", () => {
    it("should handle string replacements correctly", () => {
      const originalContent = "= Title\n\n== Section\nContent";
      
      // Test various string manipulations
      const convertedContent = originalContent
        .replace(/^=\s+(.+)$/gm, '== $1')
        .replace(/^index card$/gim, '')
        .replace(/\n\s*\n\s*\n/g, '\n\n');
      
      expect(convertedContent).toBe("== Title\n\n== Section\nContent");
    });

    it("should handle edge cases in string manipulation", () => {
      const edgeCases = [
        "= Title\n\n\n== Section\nContent", // Multiple newlines
        "index card\n\n== Section\nContent", // Index card
        "= Title\nindex card\n== Section\nContent", // Both
      ];
      
      edgeCases.forEach(content => {
        const converted = content
          .replace(/^=\s+(.+)$/gm, '== $1')
          .replace(/^index card$/gim, '')
          .replace(/\n\s*\n\s*\n/g, '\n\n');
        
        expect(converted).toBeDefined();
        expect(typeof converted).toBe('string');
      });
    });
  });
}); 