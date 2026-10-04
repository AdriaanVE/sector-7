import createCache, { StylisElement, StylisPlugin } from '@emotion/cache';

import { Inter, JetBrains_Mono } from 'next/font/google';
import { extendTheme } from '@mui/joy';
import type { SxProps } from '@mui/joy/styles/types';

import { animationEnterBelow, animationOpacityFadeIn } from '~/common/util/animUtils';


// Definitions
export type UIComplexityMode = 'minimal' | 'pro' | 'extra';
export type ContentScaling = 'xs' | 'sm' | 'md';


// CSS utils
export const hideOnMobile = { display: { xs: 'none', md: 'flex' } };


// Theme & Fonts

const font = Inter({
  weight: [ /* '300', sm */ '400' /* (undefined, default) */, '500' /* md */, '600' /* lg */, '700' /* xl */],
  subsets: ['latin'],
  display: 'swap',
  fallback: ['Helvetica', 'Arial', 'sans-serif'],
});
export const themeFontFamilyCss = font.style.fontFamily;

const jetBrainsMono = JetBrains_Mono({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  display: 'swap',
  fallback: ['monospace'],
});
export const themeCodeFontFamilyCss = jetBrainsMono.style.fontFamily;

/**
 * Hotter lime for 'New'/'Beta' badges - intentionally brighter than the 400 brand anchor
 * so tiny chips pop; pairs with black text and bold weight. Mirrors the website's
 * RankingsSection chipNew - keep the two in sync.
 */
export const brandLimeExtraBadge = '#d4ff3a';
// Brighter version of the composer contour purple keeps small menu labels readable.
const brandPurpleText = '#bc7bff';


// Motion responds to interaction; focus remains static and visible.
const controlMotion = {
  transition: 'transform 160ms ease-out, border-color 160ms ease-out, background-color 160ms ease-out, box-shadow 160ms ease-out',
  '&:not(:disabled):not([aria-disabled="true"]):hover': { transform: 'translateY(-1px)', boxShadow: 'inset 0 0 0 1px rgba(168, 85, 247, .6)' },
  '&:not(:disabled):active': { transform: 'translateY(0)', transitionDuration: '80ms' },
  '&:focus-visible': { outline: '2px solid var(--joy-palette-focusVisible)', outlineOffset: 2, transform: 'none' },
  '@media (prefers-reduced-motion: reduce)': { transition: 'none', '&:not(:disabled):not([aria-disabled="true"]):hover': { transform: 'none' } },
  '@media (forced-colors: active)': { boxShadow: 'none', '&:focus-visible': { outline: '2px solid Highlight' }, '&:not(:disabled):not([aria-disabled="true"]):hover': { transform: 'none', boxShadow: 'none', outline: '2px solid Highlight' } },
} as const;

// Shared by Joy menus and controlled menu popups. Embedded panel lists keep their layout.
export const appMenuSx = {
  '--List-padding': '4px',
  '--List-gap': '1px',
  '--ListDivider-gap': '4px',
  '--ListItem-minHeight': '2.25rem',
  '--ListItem-paddingX': '0.625rem',
  '--ListItem-paddingY': '0.25rem',
  '--ListItem-radius': '6px',
  '--ListItemDecorator-size': '1.75rem',
  '--Icon-fontSize': '1.0625rem',
  fontSize: '0.8125rem',
  backgroundColor: 'background.popup',
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: '10px',
  boxShadow: '0 12px 32px -12px rgba(0, 0, 0, .6)',
  '& .MuiMenuItem-root': {
    '--Icon-fontSize': '1.0625rem',
    fontSize: '0.8125rem',
    transition: 'background-color 120ms ease-out, color 120ms ease-out',
    '& .MuiListItemDecorator-root': { '--Icon-color': 'currentColor', transition: 'color 120ms ease-out' },
    '&.MuiMenuItem-colorNeutral:not([aria-checked="true"]) > .MuiListItemDecorator-root': { color: 'text.tertiary' },
    '& > .MuiTypography-root': { fontSize: 'inherit' },
    '&:not(.Mui-disabled):hover': {
      '--Icon-color': 'currentColor',
      '& .MuiListItemDecorator-root': { color: 'inherit' },
    },
    '&.MuiMenuItem-colorNeutral:not(.Mui-disabled):hover': {
      backgroundColor: 'neutral.softHoverBg', color: 'text.primary',
    },
    '&.MuiMenuItem-colorDanger:not(.Mui-disabled)': {
      color: brandPurpleText,
      '--Icon-color': 'currentColor',
      '&:hover': { backgroundColor: 'rgba(168, 85, 247, .14)' },
      '&:active': { backgroundColor: 'rgba(168, 85, 247, .18)' },
    },
    '&.Mui-focusVisible, &:focus-visible': {
      outline: '2px solid var(--joy-palette-focusVisible)', outlineOffset: '-2px',
    },
  },
  '@media (pointer: coarse)': { '--ListItem-minHeight': '2.75rem', '& .MuiMenuItem-root': { minHeight: '2.75rem' } },
  '@media (prefers-reduced-motion: reduce)': {
    '& .MuiMenuItem-root, & .MuiListItemDecorator-root': { transition: 'none' },
  },
  '@media (forced-colors: active)': {
    borderColor: 'CanvasText', boxShadow: 'none',
    '& .MuiMenuItem-root.MuiMenuItem-colorDanger:not(.Mui-disabled)': {
      color: 'CanvasText',
      '&:hover, &:active': { backgroundColor: 'Highlight', color: 'HighlightText' },
    },
    '& .MuiMenuItem-root.Mui-focusVisible, & .MuiMenuItem-root:focus-visible': { outline: '2px solid Highlight' },
  },
} as const satisfies SxProps;

export const createAppTheme = (uiComplexityMinimal: boolean) => extendTheme({
  radius: { xs: '4px', sm: '8px', md: '12px', lg: '16px', xl: '20px' },
  fontFamily: {
    body: themeFontFamilyCss,
    display: themeFontFamilyCss,
    code: themeCodeFontFamilyCss,
  },
  // NOTE: the standalone /dev/inspect/*.html dev tools hand-mirror these neutral/background hex tokens
  // (they intentionally have zero app imports). If you change the palette below, update those pages' CSS to match.
  colorSchemes: {
    light: {
      palette: {
        neutral: {
          plainColor: 'var(--joy-palette-neutral-800)',     // [700 -> 800] Dropdown menu: increase text contrast a bit
          solidBg: 'var(--joy-palette-neutral-700)',        // [500 -> 700] PageBar background & Button[solid]
          solidHoverBg: 'var(--joy-palette-neutral-800)',   // [600 -> 800] Buttons[solid]:hover
        },
        // primary [800] > secondary [700 -> 800] > tertiary [600] > icon [500 -> 700]
        text: {
          icon: 'var(--joy-palette-neutral-700)',           // <IconButton color='neutral' /> icon color
          secondary: 'var(--joy-palette-neutral-800)',      // increase contrast a bit
          // tertiary: 'var(--joy-palette-neutral-700)',       // increase contrast a bit
        },
        // popup [white] > surface [50] > level1 [100] > level2 [200] > level3 [300 -> unused] > body [white -> 300]
        background: {
          // New
          surface: 'var(--joy-palette-neutral-50, #FBFCFE)',
          level1: 'var(--joy-palette-neutral-100, #F0F4F8)',
          level2: 'var(--joy-palette-neutral-200, #DDE7EE)',
          body: 'var(--joy-palette-neutral-300, #CDD7E1)',
          backdrop: 'rgba(var(--joy-palette-neutral-darkChannel, 11 13 14) / 0.3333)', // was: 0.25
          // Former
          // body: 'var(--joy-palette-neutral-400, #9FA6AD)',
        },
      },
    },
    dark: {
      palette: {
        primary: {
          100: '#c7ffec', 200: '#98ffdf', 300: '#5cffce', 400: '#00FFB3', 500: '#00dca0',
          600: '#00bd89', 700: '#087358', 800: '#063e34', 900: '#06231f',
          solidBg: '#00FFB3', solidColor: '#060F14', solidHoverBg: '#5cffce', solidActiveBg: '#00bd89',
          outlinedBorder: '#A855F7', plainColor: '#00FFB3',
          softColor: '#98ffdf', softActiveColor: '#c7ffec',
        },
        neutral: {
          100: '#edf6fa', 200: '#d2e1e9', 300: '#b4c6d1', 400: '#9aafbd', 500: '#798e9b',
          600: '#526572', 700: '#2A2F36', 800: '#14212c', 900: '#060F14',
        },
        focusVisible: '#00FFB3',
        text: { primary: '#edf6fa', secondary: '#b4c6d1', tertiary: '#9aafbd', icon: '#b4c6d1' },
        background: { popup: '#14212c', surface: '#0c1924', level1: '#060F14', level2: '#10232b', body: '#060F14', backdrop: 'rgba(6, 15, 20, 0.7)' },
      },
    },
  },
  components: {
    JoyButton: { styleOverrides: { root: controlMotion } },
    JoyIconButton: { styleOverrides: { root: controlMotion } },
    JoyCard: { styleOverrides: { root: {
      transition: 'border-color 180ms ease-out, box-shadow 180ms ease-out',
      '&[role="button"], &[tabindex="0"]': { '&:hover': { borderColor: '#A855F7' }, '&:focus-visible': { outline: '2px solid var(--joy-palette-focusVisible)', outlineOffset: 2 } },
      '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
      '@media (forced-colors: active)': { borderColor: 'CanvasText', boxShadow: 'none' },
    } } },
    /**
     * Input
     *  - remove the box-shadow: https://github.com/mui/material-ui/commit/8d4728df8a66d710660af96ac7ff3f86d2d26382
     */
    JoyInput: {
      styleOverrides: {
        root: {
          boxShadow: 'none',
        },
      },
    },

    /**
     * Select
     * - remove the box-shadow: https://github.com/mui/material-ui/commit/8d4728df8a66d710660af96ac7ff3f86d2d26382
     * */
    JoySelect: {
      styleOverrides: {
        root: {
          boxShadow: 'none',
        },
      },
    },

    /**
     * Badge
     * - add a 'color-feature' color, to be used with the FeatureBadge component
     */
    JoyBadge: {
      styleOverrides: {
        badge: ({ ownerState }) =>
          // HACK: we set this to 'color-feature' to force the theming to our liking
          (ownerState.color as any) !== 'color-feature' ? undefined : ({
            backgroundColor: '#5B8CFF', color: '#060F14',
          }),
      },
    },

    JoyMenu: {
      styleOverrides: {
        root: ({ theme, ownerState }) => theme.unstable_sx({
          ...appMenuSx,
          ...(ownerState.variant === 'plain' && { border: 'none' }),
        }),
      },
    },

    JoyModal: {
      styleOverrides: {
        backdrop: uiComplexityMinimal ? {
          backdropFilter: 'none', // always un-blur on minimal
          // and no animation either, to keep it simple
        } : {
          animation: `${animationOpacityFadeIn} 0.16s ease-out`,
        },
      },
    },
    JoyModalDialog: {
      styleOverrides: {
        root: ({ theme }) => ({
          [theme.breakpoints.down('sm')]: {
            '--Card-padding': '1rem',
          },
          ...(!uiComplexityMinimal && {
            '& .agi-animate-enter': {
              animation: `${animationEnterBelow} 0.16s ease-out`,
            },
          }),
        }),
      },
    },

    /**
     * Switch: increase the size of the thumb, to a default iconButton
     * NOTE: do not use anything else than 'md' size
     */
    JoySwitch: {
      styleOverrides: {
        root: ({ ownerState }) => ({
          ...(ownerState.size === 'md' && {
            // '--Switch-trackWidth': '36px',
            // '--Switch-trackHeight': '22px',
            // '--Switch-thumbSize': '17px',
            '--Switch-thumbSize': '16px',
          }),
        }),
      },
    },
  },
});

export const themeBgApp = 'background.level1';
export const themeBgAppDarker = 'background.level2';
export const themeBgAppChatComposer = 'background.surface';

export const themeMinWidthChatPane = '18rem'; // chat list + chat/beam wrapper floor (was the panel's minSize=20%); below it the message list overflows and the scroll box pans horizontally
export const lineHeightChatTextMd = 1.75;
export const lineHeightTextareaMd = 1.75;

export const themeZIndexBeamView = 10;
export const themeZIndexPageBar = 25;
export const themeZIndexDesktopDrawer = 26;
export const themeZIndexDesktopPanel = 27;
export const themeZIndexDesktopNav = 30;
export const themeZIndexChatBubble = 50;
export const themeZIndexDragOverlay = 60;
export const themeZIndexOverMobileDrawer = 1301;


// Dynamic UI Sizing

export function adjustContentScaling(scaling: ContentScaling, offset?: number) {
  if (!offset) return scaling;
  const scalingArray = ['xs', 'sm', 'md'];
  const scalingIndex = scalingArray.indexOf(scaling);
  const newScalingIndex = Math.max(0, Math.min(scalingArray.length - 1, scalingIndex + offset));
  return scalingArray[newScalingIndex] as ContentScaling;
}

interface ContentScalingOptions {
  // BlocksRenderer
  blockCodeFontSize: string;
  blockCodeMarginY: number;
  blockFontSize: string;
  blockImageGap: number;
  blockLineHeight: string | number;
  // ChatMessage
  chatMessagePadding: number;
  fragmentButtonFontSize: string;
  // ChatDrawer
  chatDrawerItemSx: { '--ListItem-minHeight': string, fontSize: string };
  chatDrawerItemFolderSx: { '--ListItem-minHeight': string, fontSize: string };
  // OptimaPanelGroup
  optimaPanelGroupSize: 'sm' | 'md';
}

export const themeScalingMap: Record<ContentScaling, ContentScalingOptions> = {
  xs: {
    blockCodeFontSize: '0.75rem',
    blockCodeMarginY: 0.5,
    blockFontSize: 'xs',
    blockImageGap: 1,
    blockLineHeight: 1.666667,
    chatMessagePadding: 1,
    fragmentButtonFontSize: 'xs',
    chatDrawerItemSx: { '--ListItem-minHeight': '2.25rem', fontSize: 'sm' },          // 36px
    chatDrawerItemFolderSx: { '--ListItem-minHeight': '2.5rem', fontSize: 'sm' },     // 40px
    optimaPanelGroupSize: 'sm',
  },
  sm: {
    blockCodeFontSize: '0.75rem',
    blockCodeMarginY: 1,
    blockFontSize: 'sm',
    blockImageGap: 1.5,
    blockLineHeight: 1.714286,
    chatMessagePadding: 1.5,
    fragmentButtonFontSize: 'sm',
    chatDrawerItemSx: { '--ListItem-minHeight': '2.25rem', fontSize: 'sm' },
    chatDrawerItemFolderSx: { '--ListItem-minHeight': '2.5rem', fontSize: 'sm' },
    optimaPanelGroupSize: 'sm',
  },
  md: {
    blockCodeFontSize: '0.875rem',
    blockCodeMarginY: 1.5,
    blockFontSize: 'md',
    blockImageGap: 2,
    blockLineHeight: 1.75,
    chatMessagePadding: 2,
    fragmentButtonFontSize: 'sm',
    chatDrawerItemSx: { '--ListItem-minHeight': '2.5rem', fontSize: 'md' },           // 40px
    chatDrawerItemFolderSx: { '--ListItem-minHeight': '2.75rem', fontSize: 'md' },    // 44px
    optimaPanelGroupSize: 'md',
  },
  // lg: {
  //   chatDrawerFoldersLineHeight: '3rem',
  // },
};


// Emotion Cache (with insertion point on the SSR pass)

const isBrowser = typeof document !== 'undefined';

const emotionStylisPlugins: StylisPlugin[] = [

  /**
   * 1. remove the default prefixer plugin: probably not needed and bloating
   */
  // prefixer,

  /**
   * 2. add a function to remove wide-matching CSS rules from Joy UI.
   * Culprit: https://github.com/mui/material-ui/blob/a705e1f15075b2deb59263868bfa7b1d9f84cdd4/packages/mui-joy/src/Checkbox/Checkbox.tsx#L59
   * These '~ *' rules are slow and cause a lot of reflows.
   *
   * To validate, search the Elements tab for JoyCheckbox-root, and see if there's the '~ *' rule.
   */
  function removeSlowCSS(element: StylisElement /*, index, children, callback*/) {
    if (
      element.type === 'rule' // only operate on rules
      && element.value.endsWith('~*')  // where the selector is broad reaching
      && Array.isArray(element.children)  // and there are children (rules)
    ) {
      // console.log('✓ Filtering out problematic selector:', element);
      element.return = ' ';  // removes the selector (empirical)
      element.children = []; // removes the rule (empirical)
    }
  },

];


export function createEmotionCache() {
  let insertionPoint: HTMLElement | undefined;

  if (isBrowser) {
    // On the client side, _document.tsx has a meta tag with the name "emotion-insertion-point" at the top of the <head>.
    // This assures that MUI styles are loaded first, and allows allows developers to easily override MUI styles with other solutions like CSS modules.
    const emotionInsertionPoint = document.querySelector<HTMLMetaElement>(
      'meta[name="emotion-insertion-point"]',
    );
    insertionPoint = emotionInsertionPoint ?? undefined;
  }

  return createCache({ key: 'mui-style', insertionPoint: insertionPoint, stylisPlugins: emotionStylisPlugins });
}

// MISC

// For next April Fools' week
// export const foolsMode = new Date().getMonth() === 3 && new Date().getDate() <= 7;
