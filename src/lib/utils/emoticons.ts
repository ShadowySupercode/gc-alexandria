// Heroicon Svelte components (assume these are available in src/lib/icons/heroicons)
import Heart from 'svelte-heros/dist/Heart.svelte';
import FaceSmile from 'svelte-heros/dist/FaceSmile.svelte';
import FaceFrown from 'svelte-heros/dist/FaceFrown.svelte';
import Fire from 'svelte-heros/dist/Fire.svelte';
import HandRaised from 'svelte-heros/dist/HandRaised.svelte';
import ThumbDown from 'svelte-heros/dist/ThumbDown.svelte';
import ThumbUp from 'svelte-heros/dist/ThumbUp.svelte';
import Eye from 'svelte-heros/dist/Eye.svelte';
import LightBulb from 'svelte-heros/dist/LightBulb.svelte';
import Pencil from 'svelte-heros/dist/Pencil.svelte';
import RocketLaunch from 'svelte-heros/dist/RocketLaunch.svelte';
import Star from 'svelte-heros/dist/Star.svelte';
import Sun from 'svelte-heros/dist/Sun.svelte';
import Moon from 'svelte-heros/dist/Moon.svelte';
import Trash from 'svelte-heros/dist/Trash.svelte';
import Trophy from 'svelte-heros/dist/Trophy.svelte';
import Cake from 'svelte-heros/dist/Cake.svelte';
import CurrencyDollar from 'svelte-heros/dist/CurrencyDollar.svelte';
import CurrencyEuro from 'svelte-heros/dist/CurrencyEuro.svelte';
import ExclamationCircle from 'svelte-heros/dist/ExclamationCircle.svelte';


export const heroiconEmoticons = [
  { name: 'Heart', shortcode: ':heart:', component: Heart },
  { name: 'Smile', shortcode: ':face-smile:', component: FaceSmile },
  { name: 'Frown', shortcode: ':face-frown:', component: FaceFrown },
  { name: 'Fire', shortcode: ':fire:', component: Fire },
  { name: 'Hand Raised', shortcode: ':hand-raised:', component: HandRaised },
  { name: 'Thumb Down', shortcode: ':hand-thumb-down:', component: ThumbDown },
  { name: 'Thumb Up', shortcode: ':hand-thumb-up:', component: ThumbUp },
  { name: 'Eye', shortcode: ':eye:', component: Eye },
  { name: 'Light Bulb', shortcode: ':light-bulb:', component: LightBulb },
  { name: 'Pencil Square', shortcode: ':pencil-square:', component: Pencil },
  { name: 'Rocket', shortcode: ':rocket-launch:', component: RocketLaunch },
  { name: 'Star', shortcode: ':star:', component: Star },
  { name: 'Sun', shortcode: ':sun:', component: Sun },
  { name: 'Moon', shortcode: ':moon:', component: Moon },
  { name: 'Trash', shortcode: ':trash:', component: Trash },
  { name: 'Trophy', shortcode: ':trophy:', component: Trophy },
  { name: 'Cake', shortcode: ':cake:', component: Cake },
  { name: 'Dollar Sign', shortcode: ':dollar-sign:', component: CurrencyDollar },
  { name: 'Euro Sign', shortcode: ':euro-sign:', component: CurrencyEuro },
  { name: 'Exclamation Circle', shortcode: ':exclamation-circle:', component: ExclamationCircle }
];

// Unicode emojis, excluding those covered by heroicons
export const unicodeEmojis = [
  { name: 'Laughing', shortcode: ':joy:', char: '😂' },
  { name: 'Crying', shortcode: ':sob:', char: '😭' },
  { name: 'Call Me Hand', shortcode: ':call-me-hand:', char: '🤙' },
  { name: 'Waving Hand', shortcode: ':wave:', char: '👋' },
  { name: 'Pinched Fingers', shortcode: ':pinched-fingers:', char: '🤌' },
  // ...add more as needed, ensuring no overlap with heroiconEmoticons
];

/**
 * Get the Unicode character for a given shortcode, searching both heroicon and unicode lists.
 * Returns undefined if not found.
 */
export function getUnicodeEmoji(shortcode: string): string | undefined {
  // Map heroicon shortcodes to a reasonable Unicode fallback
  const heroiconFallbacks: Record<string, string> = {
    ':heart:': '❤️',
    ':face-smile:': '🙂',
    ':face-frown:': '🙁',
    ':fire:': '🔥',
    ':hand-raised:': '✋',
    ':hand-thumb-down:': '👎',
    ':hand-thumb-up:': '👍',
    ':bell:': '🔔',
    ':eye:': '👁️',
    ':light-bulb:': '💡',
    ':pencil-square:': '✏️',
    ':rocket-launch:': '🚀',
    ':star:': '⭐',
    ':sun:': '☀️',
    ':moon:': '🌙',
    ':trash:': '🗑️',
    ':trophy:': '🏆',
  };
  if (heroiconFallbacks[shortcode]) return heroiconFallbacks[shortcode];
  const unicode = unicodeEmojis.find(e => e.shortcode === shortcode);
  return unicode ? unicode.char : undefined;
} 