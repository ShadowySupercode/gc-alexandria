/**
 * Shared test fixtures for highlight functionality
 * Used across multiple test files to ensure consistency
 */

import type { NDKEvent } from "@nostr-dev-kit/ndk";

export interface MockProfile {
	pubkey: string;
	name: string;
	displayName?: string;
	picture?: string;
	about?: string;
	nip05?: string;
}

export interface MockHighlight {
	kind: 9802;
	pubkey: string;
	content: string;
	tags: string[][];
	id: string;
	created_at: number;
	sig: string;
}

/**
 * Mock user profiles (kind 0)
 */
export const mockProfiles: MockProfile[] = [
	{
		pubkey: "fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1",
		name: "alice",
		displayName: "Alice Johnson",
		picture: "https://example.com/alice.jpg",
		about: "Software engineer and avid reader",
		nip05: "alice@nostr.example",
	},
	{
		pubkey: "82341f882b6eabcd2ba7f1ef90aad961cf074af15b9ef44a09f9d2a8fbfbe6a2",
		name: "bob_dev",
		displayName: "Bob Smith",
		picture: "https://example.com/bob.jpg",
		about: "Developer, writer, thinker",
		nip05: "bob@nostr.example",
	},
	{
		pubkey: "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d",
		name: "carol",
		displayName: "Carol Williams",
		about: "Research scientist",
	},
	{
		pubkey: "7e7e9c42a91bfef19fa929e5fda1b72e0ebc1a4c1141673e2794234d86addf4e",
		// No profile data - should fall back to shortened npub
		name: "",
		displayName: "",
	},
];

/**
 * Mock highlight events (kind 9802)
 * Distributed across multiple users with varying content lengths
 */
export const mockHighlights: MockHighlight[] = [
	// Alice's highlights
	{
		kind: 9802,
		pubkey: mockProfiles[0].pubkey,
		content: "This is a fascinating insight about the nature of decentralized systems.",
		tags: [
			[
				"a",
				"30041:fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1:section-introduction",
			],
			[
				"context",
				"Before we dive into the details, this is a fascinating insight about the nature of decentralized systems. It's important to understand the fundamentals.",
			],
			["p", "fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1", "", "author"],
		],
		id: "highlight-alice-1",
		created_at: 1704067200,
		sig: "mock-signature-1",
	},
	{
		kind: 9802,
		pubkey: mockProfiles[0].pubkey,
		content: "Brilliant explanation of cryptographic signatures",
		tags: [
			[
				"a",
				"30041:fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1:section-cryptography",
			],
			["context", "In this section, we explore how brilliant explanation of cryptographic signatures enables secure communication."],
			["p", "fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1", "", "author"],
		],
		id: "highlight-alice-2",
		created_at: 1704067300,
		sig: "mock-signature-2",
	},
	{
		kind: 9802,
		pubkey: mockProfiles[0].pubkey,
		content:
			"The economic incentives here are particularly well thought out and demonstrate a deep understanding of game theory",
		tags: [
			[
				"a",
				"30041:fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1:section-economics",
			],
			[
				"context",
				"Looking at the broader picture, the economic incentives here are particularly well thought out and demonstrate a deep understanding of game theory, which is crucial for long-term sustainability.",
			],
			["p", "fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1", "", "author"],
		],
		id: "highlight-alice-3",
		created_at: 1704067400,
		sig: "mock-signature-3",
	},

	// Bob's highlights
	{
		kind: 9802,
		pubkey: mockProfiles[1].pubkey,
		content: "Key insight",
		tags: [
			[
				"a",
				"30041:fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1:section-introduction",
			],
			["context", "This represents a key insight into the problem."],
			["p", "fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1", "", "author"],
		],
		id: "highlight-bob-1",
		created_at: 1704067500,
		sig: "mock-signature-4",
	},
	{
		kind: 9802,
		pubkey: mockProfiles[1].pubkey,
		content:
			"This paragraph perfectly encapsulates the core challenge we face when building distributed systems at scale",
		tags: [
			[
				"a",
				"30041:fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1:section-challenges",
			],
			[
				"context",
				"As we'll see, this paragraph perfectly encapsulates the core challenge we face when building distributed systems at scale and provides a roadmap for solutions.",
			],
			["p", "fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1", "", "author"],
			["comment", "I completely agree with this assessment"],
		],
		id: "highlight-bob-2",
		created_at: 1704067600,
		sig: "mock-signature-5",
	},

	// Carol's highlights
	{
		kind: 9802,
		pubkey: mockProfiles[2].pubkey,
		content: "The mathematical proof provided here is rigorous and elegant, making complex concepts accessible",
		tags: [
			[
				"a",
				"30041:fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1:section-mathematics",
			],
			[
				"context",
				"In the formal analysis section, the mathematical proof provided here is rigorous and elegant, making complex concepts accessible to readers with varying backgrounds.",
			],
			["p", "fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1", "", "author"],
		],
		id: "highlight-carol-1",
		created_at: 1704067700,
		sig: "mock-signature-6",
	},

	// User without profile (should fall back to npub)
	{
		kind: 9802,
		pubkey: mockProfiles[3].pubkey,
		content: "Important consideration for privacy-preserving protocols",
		tags: [
			[
				"a",
				"30041:fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1:section-privacy",
			],
			["context", "This is an important consideration for privacy-preserving protocols in decentralized networks."],
			["p", "fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1", "", "author"],
		],
		id: "highlight-unknown-1",
		created_at: 1704067800,
		sig: "mock-signature-7",
	},
];

/**
 * Get profile by pubkey
 */
export function getMockProfileByPubkey(pubkey: string): MockProfile | null {
	return mockProfiles.find((p) => p.pubkey === pubkey) || null;
}

/**
 * Get highlights by pubkey
 */
export function getMockHighlightsByPubkey(pubkey: string): MockHighlight[] {
	return mockHighlights.filter((h) => h.pubkey === pubkey);
}

/**
 * Get unique pubkeys from highlights
 */
export function getUniquePubkeysFromHighlights(highlights: MockHighlight[]): string[] {
	return [...new Set(highlights.map((h) => h.pubkey))];
}

/**
 * Mock publication event for testing
 */
export const mockPublicationEvent = {
	kind: 30040,
	pubkey: "fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1",
	content: "Test publication with multiple sections",
	tags: [
		["d", "test-publication"],
		["title", "Test Publication"],
		["a", "30041:fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1:section-introduction"],
		["a", "30041:fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1:section-cryptography"],
		["a", "30041:fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1:section-economics"],
		["a", "30041:fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1:section-challenges"],
		["a", "30041:fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1:section-mathematics"],
		["a", "30041:fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1:section-privacy"],
	],
	id: "pub-1",
	created_at: 1704067000,
	sig: "mock-pub-signature",
};
