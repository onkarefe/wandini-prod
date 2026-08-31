import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
} from 'react';

type AxisLock = 'x' | 'y';

type ConfiguratorProps = {
  imageUrl: string;
  /** Gerçek genişlik (cm) */
  width: number;
  /** Gerçek yükseklik (cm) */
  height: number;
  /** Natural piksel koordinatlarıyla crop sonucu (opsiyonel) */
  onCropChange?: (crop: { x: number; y: number; w: number; h: number } | null) => void;
  /** Preview için yüklenen img referansı (opsiyonel) */
  onImageReady?: (img: HTMLImageElement | null) => void;
};

type Selection = {
  x: number;
  y: number;
  w: number;
  h: number;
};

const MAX_PANEL_CM = 70;

const clamp = (v: number, min: number, max: number) =>
  Math.min(Math.max(v, min), max);

export function createNormalizedCropRatio({
  x,
  y,
  width,
  height,
  imageWidth,
  imageHeight,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  imageWidth: number;
  imageHeight: number;
}) {
  const naturalWidth = Math.max(1, Math.round(imageWidth));
  const naturalHeight = Math.max(1, Math.round(imageHeight));
  const startX = clamp(Math.round(x), 0, naturalWidth - 1);
  const startY = clamp(Math.round(y), 0, naturalHeight - 1);
  const endX = clamp(Math.round(x + width), startX + 1, naturalWidth);
  const endY = clamp(Math.round(y + height), startY + 1, naturalHeight);

  return {
    x: startX / naturalWidth,
    y: startY / naturalHeight,
    w: (endX - startX) / naturalWidth,
    h: (endY - startY) / naturalHeight,
  };
}

export function Configurator({
  imageUrl,
  width: realWcm,
  height: realHcm,
  onCropChange,
  onImageReady,
}: ConfiguratorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const targetAspect =
    realWcm > 0 && realHcm > 0 ? realWcm / realHcm : 1;

  const [axisLock, setAxisLock] = useState<AxisLock>('x');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const activePointerIdRef = useRef<number | null>(null);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);

  /** Never carry pixel-based layout state from one product image to another. */
  useEffect(() => {
    setImageLoaded(false);
    setSelection(null);
    setIsDragging(false);
    activePointerIdRef.current = null;
    lastPointerRef.current = null;
  }, [imageUrl]);

  /** img rect'ini container'a göre döndür */
  const getImageRectInContainer = useCallback(() => {
    const container = containerRef.current;
    const img = imgRef.current;
    if (!container || !img) return null;

    const containerRect = container.getBoundingClientRect();
    const imgRect = img.getBoundingClientRect();
    return {
      left: imgRect.left - containerRect.left,
      top: imgRect.top - containerRect.top,
      width: imgRect.width,
      height: imgRect.height,
    };
  }, []);

  /** JS CropManager.computeAxisLock karşılığı */
  const computeAxisLock = useCallback((): AxisLock => {
    const r = getImageRectInContainer();
    if (!r) return 'x';
    const imgRatio = r.width / r.height;
    return targetAspect <= imgRatio ? 'x' : 'y';
  }, [getImageRectInContainer, targetAspect]);

  /** JS CropManager.clampSelectionToImage karşılığı */
  const clampSelectionToImage = useCallback(
    (sel: Selection, lock: AxisLock): Selection => {
      const r = getImageRectInContainer();
      if (!r) return sel;

      let { x, y, w, h } = sel;

      if (lock === 'x') {
        // yatay crop, yükseklik sabit
        h = r.height;
        y = r.top;
        w = Math.min(w, r.width);
        if (w < 1) w = 1;

        if (x < r.left) x = r.left;
        if (x + w > r.left + r.width) {
          x = r.left + r.width - w;
        }
      } else {
        // dikey crop, genişlik sabit
        w = r.width;
        x = r.left;
        h = Math.min(h, r.height);
        if (h < 1) h = 1;

        if (y < r.top) y = r.top;
        if (y + h > r.top + r.height) {
          y = r.top + r.height - h;
        }
      }

      return { x, y, w, h };
    },
    [getImageRectInContainer]
  );

  /** JS CropManager.sizeSelectionForAspect karşılığı */
  const resizeSelectionForAspect = useCallback(
    (prev: Selection | null, lock: AxisLock, keepCenter: boolean): Selection | null => {
      const r = getImageRectInContainer();
      if (!r) return prev;

      const R = targetAspect || 1;
      let sel: Selection;

      if (prev) {
        sel = { ...prev };
      } else {
        // ilk kez oluşturuluyorsa, tüm resmi baz al
        sel = {
          x: r.left,
          y: r.top,
          w: r.width,
          h: r.height,
        };
      }

      const cx = sel.x + sel.w / 2;
      const cy = sel.y + sel.h / 2;

      if (lock === 'x') {
        sel.h = r.height;
        sel.w = sel.h * R;
        sel.y = r.top;
        sel.x = keepCenter
          ? cx - sel.w / 2
          : r.left + (r.width - sel.w) / 2;
      } else {
        sel.w = r.width;
        sel.h = sel.w / R;
        sel.x = r.left;
        sel.y = keepCenter
          ? cy - sel.h / 2
          : r.top + (r.height - sel.h) / 2;
      }

      sel = clampSelectionToImage(sel, lock);
      return sel;
    },
    [getImageRectInContainer, targetAspect, clampSelectionToImage]
  );

  /** Görsel yüklendiğinde axisLock + seçim oluştur */
  useEffect(() => {
    if (!imageLoaded) return;

    const lock = computeAxisLock();
    setAxisLock(lock);
    setSelection((prev) => resizeSelectionForAspect(prev, lock, false));
  }, [imageLoaded, targetAspect, imageUrl, computeAxisLock, resizeSelectionForAspect]);

  /** Drag başlangıcı */
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!selection) return;
    e.preventDefault();

    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);

    activePointerIdRef.current = e.pointerId;
    lastPointerRef.current = { x: e.clientX, y: e.clientY };
    setIsDragging(true);
    document.body.style.cursor = 'move';
  };

  /** Drag hareketleri — clientX/clientY delta ile, null-safe */
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!isDragging) return;
      if (
        activePointerIdRef.current !== null &&
        e.pointerId !== activePointerIdRef.current
      ) {
        return;
      }

      e.preventDefault();

      const last = lastPointerRef.current;
      if (!last) return;

      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      lastPointerRef.current = { x: e.clientX, y: e.clientY };

      setSelection((prev) => {
        if (!prev) return prev; // null ise dokunma

        let next: Selection = { ...prev };

        if (axisLock === 'x') {
          next.x = prev.x + dx;
          next.y = prev.y;
        } else {
          next.x = prev.x;
          next.y = prev.y + dy;
        }

        next = clampSelectionToImage(next, axisLock);
        return next;
      });
    };

    const endDrag = (e: PointerEvent) => {
      if (!isDragging) return;
      setIsDragging(false);
      activePointerIdRef.current = null;
      lastPointerRef.current = null;
      document.body.style.cursor = '';
      try {
        (e.target as HTMLElement | null)?.releasePointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
    };
  }, [isDragging, axisLock, clampSelectionToImage]);

  /** JS CropManager.getCrop karşılığı — parent'a natural piksel crop gönder */
  useEffect(() => {
    if (!onCropChange) return;

    const img = imgRef.current;
    const container = containerRef.current;
    if (!img || !container || !selection || !imageLoaded) {
      onCropChange(null);
      return;
    }

    const imgRect = getImageRectInContainer();
    if (!imgRect || imgRect.width === 0 || imgRect.height === 0) {
      onCropChange(null);
      return;
    }

    const naturalW = img.naturalWidth || img.width;
    const naturalH = img.naturalHeight || img.height;
    if (!naturalW || !naturalH) {
      onCropChange(null);
      return;
    }

    const scaleX = naturalW / imgRect.width;
    const scaleY = naturalH / imgRect.height;

    const relX = selection.x - imgRect.left;
    const relY = selection.y - imgRect.top;

    onCropChange(
      createNormalizedCropRatio({
        x: relX * scaleX,
        y: relY * scaleY,
        width: selection.w * scaleX,
        height: selection.h * scaleY,
        imageWidth: naturalW,
        imageHeight: naturalH,
      }),
    );

  }, [selection, imageLoaded, getImageRectInContainer, onCropChange]);

  /** Dış overlay blokları (JS updateDimOverlays mantığı) */
  const renderOverlays = () => {
    if (!containerRef.current || !selection) return null;
    const container = containerRef.current;
    const W = container.clientWidth;
    const H = container.clientHeight;

    const { x, y, w, h } = selection;

    const topStyle: React.CSSProperties = {
      height: Math.max(0, y),
    };
    const bottomStyle: React.CSSProperties = {
      top: Math.max(0, y + h),
      height: Math.max(0, H - (y + h)),
    };
    const leftStyle: React.CSSProperties = {
      top: y,
      width: Math.max(0, x),
      height: Math.max(0, h),
    };
    const rightStyle: React.CSSProperties = {
      left: Math.max(0, x + w),
      top: y,
      width: Math.max(0, W - (x + w)),
      height: Math.max(0, h),
    };

    return (
      <>
        {y > 0 && (
          <div
            className="configuratorOverlay configuratorOverlayTop"
            style={topStyle}
          />
        )}
        {y + h < H && (
          <div
            className="configuratorOverlay configuratorOverlayBottom"
            style={bottomStyle}
          />
        )}
        {x > 0 && (
          <div
            className="configuratorOverlay configuratorOverlayLeft"
            style={leftStyle}
          />
        )}
        {x + w < W && (
          <div
            className="configuratorOverlay configuratorOverlayRight"
            style={rightStyle}
          />
        )}
      </>
    );
  };

  /** Crop kutusunun stili + iç cetvel ve grid (JS updateRulersAndGrid karşılığı) */
  const renderCropBox = () => {
    if (!selection) return null;

    const { x, y, w, h } = selection;

    const cropStyle: React.CSSProperties = {
      left: `${x}px`,
      top: `${y}px`,
      width: `${w}px`,
      height: `${h}px`,
    };

    // Panel grid: max 70 cm, equal slices
    const gridLines: React.ReactNode[] = [];
    const Wcm = Math.max(1, realWcm || 1);
    const panelCount = Math.max(1, Math.ceil(Wcm / MAX_PANEL_CM));
    const stepX = w / panelCount;

    for (let k = 1; k < panelCount; k++) {
      const lx = Math.round(k * stepX);
      gridLines.push(
        <div
          key={k}
          className="configuratorGridLine"
          style={{ left: `${lx}px` }}
        />
      );
    }

    return (
      <div
        className={`configuratorCropBox${isDragging ? ' configuratorCropBox--dragging' : ''
          }`}
        style={cropStyle}
        onPointerDown={handlePointerDown}
      >
        {/* Üst cetvel */}
        <div className="configuratorRulerTop">
          {Math.round(realWcm)} cm
        </div>
        {/* Sol cetvel */}
        <div className="configuratorRulerLeft">
          {Math.round(realHcm)} cm
        </div>
        {/* Grid container */}
        <div className="configuratorGridContainer">
          {gridLines}
        </div>
      </div>
    );
  };

  return (
    <>
      <div
        ref={containerRef}
        className="configuratorContainer"
      >
        <img
          ref={imgRef}
          src={imageUrl}
          crossOrigin="anonymous"
          alt="Produkt zur Konfiguration"
          onLoad={() => {
            setImageLoaded(true);
            onImageReady?.(imgRef.current);
          }}
          onError={() => {
            setImageLoaded(false);
            setSelection(null);
            onImageReady?.(null);
          }}
          className="configuratorImage"
        />


        {renderOverlays()}
        {renderCropBox()}
      </div>

      {/* Preview button moved to modal right panel */}
    </>
  );
}
