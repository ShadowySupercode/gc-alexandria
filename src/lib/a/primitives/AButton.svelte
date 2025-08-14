<script lang="ts">
  import { cva, twMerge } from '$lib/styles/cva';
  let {
    variant = 'solid',
    size = 'md',
    as = 'button',
    disabled = false,
    class: className = '',
    // common attrs (no $$restProps in runes)
    href = undefined as string | undefined,
    target = undefined as string | undefined,
    rel = undefined as string | undefined,
    type = 'button',
    onclick = undefined as undefined | ((e:MouseEvent)=>void)
  } = $props();

  const styles = cva(
    'inline-flex items-center justify-center font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-primary/40 transition',
    { variants: { variant:
        { solid: 'bg-primary text-[rgb(var(--color-primary-contrast,255 255 255))] hover:bg-primary/90',
          outline: 'border border-primary text-primary hover:bg-primary/10',
          ghost: 'text-primary hover:bg-primary/10' },
        size: { sm: 'h-8 px-3 text-sm', md: 'h-10 px-4', lg: 'h-12 px-5 text-lg' } },
      defaultVariants: { variant: 'solid', size: 'md' } }
  );
</script>

<svelte:element
  this={as}
  class={twMerge(styles({ variant, size }), className)}
  disabled={as === 'button' ? disabled : undefined}
  href={as === 'a' ? href : undefined}
  target={as === 'a' ? target : undefined}
  rel={as === 'a' ? rel : undefined}
  type={as === 'button' ? type : undefined}
  onclick={onclick}
>
  <slot />
</svelte:element>
