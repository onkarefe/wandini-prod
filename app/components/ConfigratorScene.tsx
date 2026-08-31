// app/components/ConfigratorScene.tsx

import React, { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

// SVG sahneler
import sceneSmall from '~/assets/scenes/small.svg';
import sceneMedium from '~/assets/scenes/medium.svg';
import sceneLarge from '~/assets/scenes/large.svg';
import {useTranslation} from '~/i18n/useTranslation';

type CropRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type ConfigratorSceneProps = {
  isOpen: boolean;
  onClose: () => void;
  confirmButton?: React.ReactNode;
  onConfirm?: () => void;
  confirmDisabled?: boolean;
  inline?: boolean;
  showCloseButton?: boolean;
  imageUrl: string;
  widthCm: number; // gerçek genişlik (cm)
  heightCm: number; // gerçek yükseklik (cm)
  crop: CropRect | null; // Configurator'dan gelen natural pixel crop
};

/* ======== Helpers: clamp + aspectRatio ======== */

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function aspectRatio(width: number, height: number): number {
  if (!width || !height) return 1;
  return width / height;
}

/* ======== composition.js portu (pure math) ======== */

type CompositionConfig = {
  W_REF_CM: number;
  F_REF: number;
  ALPHA: number;
  T_HEADROOM: number;
  G_GAP: number;
  S_MIN: number;
  S_MAX: number;
  HARD_CAP: boolean;
};

type CompositionInputs = {
  stageW: number;
  stageH: number;
  realWcm: number;
  realHcm: number;
  config?: Partial<CompositionConfig>;
};

type CompositionResult = {
  ratio: number;
  frontVis: number;
  wallHeight: number;
  sideVis: number;
  limits: {
    minFrontVis: number;
    capHorizontal: number;
    capVertical: number;
    headroom: number;
  };
  config: CompositionConfig;
};

function defaultCompositionConfig(): CompositionConfig {
  return {
    W_REF_CM: 300,
    F_REF: 0.68,
    ALPHA: 0.9,
    T_HEADROOM: 0.1,
    G_GAP: 0.02,
    S_MIN: 0.08,
    S_MAX: 0.22,
    HARD_CAP: true,
  };
}

function computeSideVis(
  r: number,
  cfg: CompositionConfig = defaultCompositionConfig(),
): number {
  let s: number;
  if (r <= 0.8) s = 0.2;
  else if (r <= 1.2) s = 0.16;
  else if (r <= 1.6) s = 0.14;
  else if (r <= 2.0) s = 0.12;
  else s = 0.1;

  return clamp(s, cfg.S_MIN, cfg.S_MAX);
}

function computeSizeFactor(
  realWcm: number,
  cfg: CompositionConfig = defaultCompositionConfig(),
): number {
  const w = Math.max(1, realWcm || 1);
  const f = cfg.F_REF * Math.pow(w / cfg.W_REF_CM, cfg.ALPHA);
  return clamp(f, 0.2, 0.92);
}

function computeFrontVisMin(r: number): number {
  const base = 0.4 + 0.05 * Math.log2((r || 1) + 1);
  return clamp(base, 0.42, 0.52);
}

function capacityHorizontal(
  sideVis: number,
  cfg: CompositionConfig = defaultCompositionConfig(),
): number {
  return clamp(1 - 2 * sideVis - cfg.G_GAP, 0.2, 0.95);
}

function capacityVertical(
  r: number,
  stageW: number,
  stageH: number,
  cfg: CompositionConfig = defaultCompositionConfig(),
): number {
  const head = clamp(1 - cfg.T_HEADROOM, 0.6, 0.98);
  const cap = r * head * (stageH / stageW);
  return clamp(cap, 0.1, 0.95);
}

function computeFrontVis(
  r: number,
  realWcm: number,
  stageW: number,
  stageH: number,
  cfg: CompositionConfig = defaultCompositionConfig(),
) {
  const s = computeSideVis(r, cfg);
  const fs = computeSizeFactor(realWcm, cfg);
  const fh = capacityHorizontal(s, cfg);
  const fv = capacityVertical(r, stageW, stageH, cfg);

  const cap = Math.min(fh, fv);
  const fmin = computeFrontVisMin(r);

  const frontVis = clamp(fs, fmin, cap);
  return { frontVis, sideVis: s, capH: fh, capV: fv, minF: fmin };
}

function computeWallHeightFromRatio(
  frontVis: number,
  r: number,
  stageW: number,
  stageH: number,
  cfg: CompositionConfig = defaultCompositionConfig(),
): number {
  const head = clamp(1 - cfg.T_HEADROOM, 0.6, 0.98);
  if (!r || r <= 0) return head;
  const raw = (frontVis * stageW) / (r * stageH);
  return Math.min(raw, head);
}

function computeComposition(inputs: CompositionInputs): CompositionResult {
  const cfg: CompositionConfig = {
    ...defaultCompositionConfig(),
    ...(inputs?.config || {}),
  };

  const stageWidth = Math.max(1, inputs.stageW || 1);
  const stageHeight = Math.max(1, inputs.stageH || 1);
  const realWidth = Math.max(1, inputs.realWcm || 1);
  const realHeight = Math.max(1, inputs.realHcm || 1);
  const r = aspectRatio(realWidth, realHeight);

  const { frontVis, sideVis, capH, capV, minF } = computeFrontVis(
    r,
    realWidth,
    stageWidth,
    stageHeight,
    cfg,
  );

  const finalFrontVis = cfg.HARD_CAP ? Math.min(frontVis, capH, capV) : frontVis;
  const wallHeight = computeWallHeightFromRatio(finalFrontVis, r, stageWidth, stageHeight, cfg);

  return {
    ratio: r,
    frontVis: finalFrontVis,
    wallHeight,
    sideVis,
    limits: {
      minFrontVis: minF,
      capHorizontal: capH,
      capVertical: capV,
      headroom: clamp(1 - cfg.T_HEADROOM, 0.6, 0.98),
    },
    config: cfg,
  };
}

function toCssPerc(x: number): string {
  return `${clamp(x, 0, 1) * 100}%`;
}

/* ======== sceneManager.js portu (variant + bottom/scale) ======== */

type SceneVariant = 'small' | 'medium' | 'large';

const VARIANT_THRESH = {
  SMALL_MAX: 350,
  MEDIUM_MAX: 600,
} as const;

const VARIANT_CSS: Record<SceneVariant, Record<string, string>> = {
  small: { '--scene-max-w': '84%', '--scene-max-h': '70%' },
  medium: { '--scene-max-w': '92%', '--scene-max-h': '66%' },
  large: { '--scene-max-w': '96%', '--scene-max-h': '60%' },
};

function variantByWidth(wCm: number): SceneVariant {
  const cleaned = String(wCm ?? '')
    .trim()
    .replace(',', '.')
    .replace(/[^\d.+-eE]/g, '');

  const w = parseFloat(cleaned);
  const W = Number.isFinite(w) ? w : 0;

  if (W <= VARIANT_THRESH.SMALL_MAX) return 'small';
  if (W <= VARIANT_THRESH.MEDIUM_MAX) return 'medium';
  return 'large';
}

function wallAspect(el: HTMLElement): number {
  const r = el.getBoundingClientRect();
  return Math.max(1, r.width) / Math.max(1, r.height);
}

function computeBottomPct(aspect: number): number {
  const a = Math.max(1, Number(aspect) || 1);
  const over = Math.max(0, a - 3);
  const raw = -(28 + 7 * a + 5 * over * over);
  return clamp(raw, -70, -30);
}

function computeScale(aspect: number): number {
  const a = Math.max(1, Number(aspect) || 1);
  const bottom = computeBottomPct(a);

  let scale = 0.9 - 0.05 * (a - 1);
  scale += (bottom + 40) * -0.002;

  return clamp(scale, 0.4, 1.0);
}

/* ======== Canvas ile crop'lanmış dataURL üretimi ======== */
/* Burada DOM'daki gerçek .configuratorImage elementini kullanıyoruz.
   Crop nesnesi natural pikselde; vanilla dataURLFromCrop ile birebir. */

async function createCroppedDataUrl(
  imageUrl: string,
  crop: CropRect,
): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const naturalW = img.naturalWidth || 0;
        const naturalH = img.naturalHeight || 0;

        const isRatioCrop =
          crop.x >= 0 &&
          crop.y >= 0 &&
          crop.w > 0 &&
          crop.h > 0 &&
          crop.x <= 1 &&
          crop.y <= 1 &&
          crop.w <= 1 &&
          crop.h <= 1;

        const pxCrop: CropRect = isRatioCrop
          ? {
              x: Math.round(crop.x * naturalW),
              y: Math.round(crop.y * naturalH),
              w: Math.round(crop.w * naturalW),
              h: Math.round(crop.h * naturalH),
            }
          : {
              x: Math.round(crop.x),
              y: Math.round(crop.y),
              w: Math.round(crop.w),
              h: Math.round(crop.h),
            };

        const safeW = Math.max(1, pxCrop.w || 0);
        const safeH = Math.max(1, pxCrop.h || 0);
        const safeX = Math.max(0, Math.min(pxCrop.x || 0, Math.max(0, naturalW - safeW)));
        const safeY = Math.max(0, Math.min(pxCrop.y || 0, Math.max(0, naturalH - safeH)));

        const off = document.createElement('canvas');
        off.width = safeW;
        off.height = safeH;
        const ctx = off.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }

        (ctx as any).imageSmoothingEnabled = true;
        try {
          (ctx as any).imageSmoothingQuality = 'high';
        } catch {
          /* ignore */
        }

        ctx.drawImage(
          img,
          safeX,
          safeY,
          safeW,
          safeH,
          0,
          0,
          safeW,
          safeH,
        );

        try {
          const url = off.toDataURL('image/jpeg', 0.92);
          resolve(url);
        } catch (err) {
          console.error('toDataURL jpeg error', err);
          try {
            const fallback = off.toDataURL();
            resolve(fallback);
          } catch (err2) {
            console.error('toDataURL png error', err2);
            resolve(null);
          }
        }
      } catch (err) {
        console.error('Allgemeiner Fehler beim Erstellen des Bildausschnitts:', err);
        resolve(null);
      }
    };

    img.onerror = (err) => {
      console.error('Fehler beim Laden des Bildes für den Bildausschnitt:', err);
      resolve(null);
    };

    img.src = imageUrl;
  });
}






export function ConfigratorScene({
  isOpen,
  onClose,
  confirmButton,
  onConfirm,
  confirmDisabled,
  inline,
  showCloseButton = true,
  imageUrl,
  widthCm,
  heightCm,
  crop,
}: ConfigratorSceneProps) {
  const {t} = useTranslation();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const roomRef = useRef<HTMLDivElement | null>(null);
  const frontWallRef = useRef<HTMLDivElement | null>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [variant, setVariant] = useState<SceneVariant>('medium');

  // Modal açılınca crop + img → dataURL
  useEffect(() => {
    let cancelled = false;

    if (!isOpen || !crop) {
      setPreviewUrl(null);
      return;
    }

    void (async () => {
      const url = await createCroppedDataUrl(imageUrl, crop);
      if (!cancelled) {
        setPreviewUrl(url);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, crop, imageUrl]);

  // Composition → room CSS var'ları
  useEffect(() => {
    if (!isOpen) return;
    if (!stageRef.current || !roomRef.current) return;

    const rect = stageRef.current.getBoundingClientRect();
    const comp = computeComposition({
      stageW: rect.width,
      stageH: rect.height,
      realWcm: widthCm,
      realHcm: heightCm,
    });

    const room = roomRef.current;
    room.style.setProperty('--front-vis', toCssPerc(comp.frontVis));
    room.style.setProperty('--wall-height', toCssPerc(comp.wallHeight));
    room.style.setProperty('--side-vis', toCssPerc(comp.sideVis));
  }, [isOpen, widthCm, heightCm]);

  // Scene variant + bottom/scale
  useEffect(() => {
    if (!isOpen) return;
    const wall = frontWallRef.current;
    if (!wall) return;

    const currentVariant = variantByWidth(widthCm);
    setVariant(currentVariant);

    const map = VARIANT_CSS[currentVariant] || VARIANT_CSS.medium;
    Object.entries(map).forEach(([k, v]) => {
      wall.style.setProperty(k, v);
    });

    const applyLayout = () => {
      if (!frontWallRef.current) return;
      const asp = wallAspect(frontWallRef.current);
      const bottom = computeBottomPct(asp);
      const scale = computeScale(asp);
      frontWallRef.current!.style.setProperty('--scene-bottom', `${bottom}%`);
      frontWallRef.current!.style.setProperty('--scene-scale', String(scale));
    };

    const raf = requestAnimationFrame(applyLayout);

    const handleResize = () => applyLayout();
    window.addEventListener('resize', handleResize);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => applyLayout());
      ro.observe(wall);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', handleResize);
      if (ro) ro.disconnect();
    };
  }, [isOpen, widthCm, previewUrl]);

  // ESC ile kapatma
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Duvar görüntüsü: öncelik crop; yoksa tam görsel
  const frontWallStyle: CSSProperties = previewUrl
    ? {
        backgroundImage: `url(${previewUrl})`,
        backgroundPosition: 'center',
        backgroundSize: 'cover',
        backgroundRepeat: 'no-repeat',
      }
    : {
        backgroundImage: `url(${imageUrl})`,
        backgroundPosition: 'center',
        backgroundSize: 'cover',
        backgroundRepeat: 'no-repeat',
      };

  let sceneSrc: string | null = null;
  if (variant === 'medium') sceneSrc = sceneMedium;
  else if (variant === 'large') sceneSrc = sceneLarge;
  else sceneSrc = null;

  const dialogContent = (
    <div
      className={`configuratorSceneDialog${inline ? ' configuratorSceneDialog--inline' : ''}`}
      role={inline ? undefined : 'dialog'}
      aria-modal={inline ? undefined : true}
      aria-label={inline ? undefined : t('configurator.roomPreview')}
    >
      {showCloseButton && (
        <button
          type="button"
          className="configuratorSceneCloseButton"
          onClick={onClose}
          aria-label={t('configurator.previewClose')}
        >
          X
        </button>
      )}

      <div ref={stageRef} className="c-stage">
        <div ref={roomRef} className="c-room">
          <div className="c-ceiling" />
          <div className="c-floor" />

          <div
            ref={frontWallRef}
            className="c-wall c-wall-front"
            style={frontWallStyle}
          >
            <div id="c-scene-overlay">
              {sceneSrc && <img src={sceneSrc} alt="" />}
            </div>
          </div>

          <div className="c-wall c-wall-left" />
          <div className="c-wall c-wall-right" />
        </div>
      </div>

      {confirmButton ? (
        confirmButton
      ) : onConfirm ? (
        <button
          type="button"
          onClick={onConfirm}
          disabled={!!confirmDisabled}
        >
          {t('product.confirmAddToCart')}
        </button>
      ) : null}
    </div>
  );

  if (inline) {
    return dialogContent;
  }

  return (
    <div className="configuratorSceneOverlay" role="presentation">
      <button
        type="button"
        className="configuratorSceneBackdrop"
        onClick={onClose}
        aria-label={t('configurator.previewClose')}
      />
      {dialogContent}
    </div>
  );
}


