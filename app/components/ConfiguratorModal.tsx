import React, {useEffect, useRef, useState} from 'react';
import {Configurator} from './Configurator';
import {ConfigratorScene2} from './ConfigratorScene2';
import {useTranslation} from '~/i18n/useTranslation';

type CropRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type SelectedQualitySummary = {
  title: string;
  properties: string[];
} | null;

export type ConfiguratorMaterialOption = {
  id: string;
  identity: string;
  title: string;
  calculatedPrice: string;
  properties: string[];
  image: {
    url: string;
    altText?: string | null;
  } | null;
  badge: string | null;
  selected: boolean;
  exists: boolean;
  variantUriQuery: string;
};

type ConfiguratorStep = 'crop' | 'materials' | 'preview';

const CONFIGURATOR_STEPS: ConfiguratorStep[] = ['crop', 'materials', 'preview'];
const CONFIGURATOR_STEP_LABELS = {
  crop: 'configurator.step.crop',
  materials: 'configurator.step.material',
  preview: 'configurator.step.preview',
} as const;

type ConfiguratorMaterialVisual = {
  featured?: boolean;
  objectPosition?: string;
};

const MATERIAL_VISUALS = {
  standard: {
  },
  premium: {
    featured: true,
  },
  premiumVinyl: {},
  selfAdhesive: {
    objectPosition: 'center bottom',
  },
  airtex: {},
} satisfies Record<string, ConfiguratorMaterialVisual>;

export function resolveMaterialVisual(
  identity: string,
): ConfiguratorMaterialVisual | null {
  const normalizedIdentity = identity.trim().toLowerCase();

  if (normalizedIdentity.includes('premium-vinyl')) {
    return MATERIAL_VISUALS.premiumVinyl;
  }
  if (normalizedIdentity.includes('selbstkleb')) {
    return MATERIAL_VISUALS.selfAdhesive;
  }
  if (normalizedIdentity.includes('airtex')) {
    return MATERIAL_VISUALS.airtex;
  }
  if (normalizedIdentity.includes('premium')) {
    return MATERIAL_VISUALS.premium;
  }
  if (normalizedIdentity.includes('standard')) {
    return MATERIAL_VISUALS.standard;
  }

  return null;
}

type ConfiguratorFlowHeaderProps = {
  step: ConfiguratorStep;
  title: string;
  description: React.ReactNode;
  titleRef: React.Ref<HTMLHeadingElement>;
  showStepGuide?: boolean;
};

function ConfiguratorStepGuide({step}: {step: ConfiguratorStep}) {
  const {t} = useTranslation();
  const currentStepIndex = CONFIGURATOR_STEPS.findIndex(
    (item) => item === step,
  );
  const currentStepNumber = currentStepIndex + 1;

  return (
    <nav
      className="configuratorStepGuide"
      aria-label={t('configurator.progress')}
    >
      <div className="configuratorStepGuideMeta">
        <strong>
          {t('configurator.step', {
            current: currentStepNumber,
            total: CONFIGURATOR_STEPS.length,
          })}
        </strong>
      </div>

      <div className="configuratorStepRail">
        <ol className="configuratorStepList">
          {CONFIGURATOR_STEPS.map((item, index) => {
            const stepNumber = index + 1;
            const isActive = index === currentStepIndex;
            const isComplete = index < currentStepIndex;

            return (
              <li
                key={item}
                className={`${isActive ? 'is-active' : ''}${
                  isComplete ? ' is-complete' : ''
                }`}
                aria-current={isActive ? 'step' : undefined}
              >
                <span className="configuratorStepNumber" aria-hidden="true">
                  {isComplete ? '✓' : stepNumber}
                </span>
                <span>{t(CONFIGURATOR_STEP_LABELS[item])}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </nav>
  );
}

function ConfiguratorFlowHeader({
  step,
  title,
  description,
  titleRef,
  showStepGuide = false,
}: ConfiguratorFlowHeaderProps) {
  return (
    <div
      className={`configuratorFlowHeader${
        showStepGuide ? '' : ' configuratorFlowHeader--copyOnly'
      }`}
    >
      <div className="configuratorFlowHeaderCopy">
        <h2 id={`configurator-${step}-title`} ref={titleRef} tabIndex={-1}>
          {title}
        </h2>
        {description ? (
          <p id={`configurator-${step}-description`}>{description}</p>
        ) : null}
      </div>

      {showStepGuide && <ConfiguratorStepGuide step={step} />}
    </div>
  );
}

type ConfiguratorModalProps = {
  isOpen: boolean;
  onClose: () => void;
  materialOptions: ConfiguratorMaterialOption[];
  onMaterialSelect: (
    material: ConfiguratorMaterialOption,
  ) => void | Promise<void>;
  selectedQualitySummary?: SelectedQualitySummary;
  confirmButton?: React.ReactNode;
  imageUrl: string;
  widthCm: number;
  heightCm: number;
  crop: CropRect | null;
  onCropChange: (crop: CropRect | null) => void;
};

export function ConfiguratorModal({
  isOpen,
  onClose,
  imageUrl,
  widthCm,
  heightCm,
  crop,
  onCropChange,
  materialOptions,
  onMaterialSelect,
  selectedQualitySummary,
  confirmButton,
}: ConfiguratorModalProps) {
  const {t} = useTranslation();
  const [step, setStep] = useState<ConfiguratorStep>('crop');
  const [selectingMaterialId, setSelectingMaterialId] = useState<string | null>(
    null,
  );
  const dialogRef = useRef<HTMLDivElement>(null);
  const stepTitleRef = useRef<HTMLHeadingElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;

    const scrollY = window.scrollY;
    const {style} = document.body;
    const prev = {
      overflow: style.overflow,
      position: style.position,
      top: style.top,
      left: style.left,
      right: style.right,
      width: style.width,
    };

    style.overflow = 'hidden';
    style.position = 'fixed';
    style.top = `-${scrollY}px`;
    style.left = '0';
    style.right = '0';
    style.width = '100%';

    return () => {
      style.overflow = prev.overflow;
      style.position = prev.position;
      style.top = prev.top;
      style.left = prev.left;
      style.right = prev.right;
      style.width = prev.width;
      window.scrollTo(0, scrollY);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setStep('crop');
        setSelectingMaterialId(null);
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusableElements = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );

      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (!dialogRef.current.contains(document.activeElement)) {
        event.preventDefault();
        firstElement.focus();
        return;
      }

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const focusFrame = window.requestAnimationFrame(() => {
      stepTitleRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(focusFrame);
  }, [isOpen, step]);

  if (!isOpen) return null;

  const handleClose = () => {
    setStep('crop');
    setSelectingMaterialId(null);
    onClose();
  };

  const handleBack = () => {
    setStep((currentStep) =>
      currentStep === 'preview' ? 'materials' : 'crop',
    );
  };

  const handleMaterialSelect = async (material: ConfiguratorMaterialOption) => {
    if (!material.exists || selectingMaterialId) return;

    setSelectingMaterialId(material.id);
    try {
      await onMaterialSelect(material);
      setStep('preview');
    } finally {
      setSelectingMaterialId(null);
    }
  };

  const selectedMaterial =
    materialOptions.find((material) => material.selected) ?? null;

  return (
    <div className="configuratorModalOverlay" role="presentation">
      <div className="configuratorModalBackdrop" aria-hidden="true" />
      <div
        ref={dialogRef}
        className={`configuratorModal configuratorModal--${step}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`configurator-${step}-title`}
        aria-describedby={`configurator-${step}-description`}
      >
        <button
          type="button"
          className="configuratorModalIconButton configuratorModalCloseButton"
          onClick={handleClose}
          aria-label={t('common.close')}
        >
          X
        </button>

        {step !== 'crop' && (
          <button
            type="button"
            className="configuratorModalIconButton configuratorModalBackButton"
            onClick={handleBack}
            aria-label={t('common.back')}
          >
            &lt;
          </button>
        )}

        <ConfiguratorFlowHeader
          step={step}
          title={
            step === 'crop'
              ? t('configurator.cropTitle')
              : step === 'materials'
                ? t('configurator.materialTitle')
                : t('configurator.previewTitle')
          }
          description={
            step === 'crop'
              ? t('configurator.cropDescription')
              : step === 'materials'
                ? t('configurator.materialDescription')
                : t('configurator.previewDescription')
          }
          titleRef={stepTitleRef}
        />

        {step === 'crop' && (
          <div className="configuratorModalBody configuratorModalBody--crop">
            <div className="configuratorModalLeft">
              <Configurator
                imageUrl={imageUrl}
                width={widthCm}
                height={heightCm}
                onCropChange={onCropChange}
              />
            </div>

            <div className="configuratorFlowFooter configuratorCropActions">
              <ConfiguratorStepGuide step="crop" />
              <button
                type="button"
                className="configuratorPreviewButton"
                disabled={!crop}
                onClick={() => setStep('materials')}
              >
                <span>{t('configurator.continueToMaterial')}</span>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {step === 'materials' && (
          <>
            <div className="configuratorModalBody configuratorModalBody--materials">
              <section
                className="configuratorMaterials"
                aria-labelledby="configurator-materials-title"
              >
                <div className="configuratorMaterialsGrid">
                  {materialOptions.map((material) => {
                    const isSelecting = selectingMaterialId === material.id;
                    const isSelectionPending = selectingMaterialId !== null;
                    const materialVisual = resolveMaterialVisual(
                      material.identity,
                    );

                    return (
                      <article
                        key={material.id}
                        className={`configuratorMaterialCard${
                          material.selected
                            ? ' configuratorMaterialCard--selected'
                            : ''
                        }${
                          materialVisual?.featured
                            ? ' configuratorMaterialCard--featured'
                            : ''
                        }`}
                      >
                        {material.image && (
                          <div className="configuratorMaterialMedia">
                            <img
                              src={material.image.url}
                              alt={
                                material.image.altText ||
                                t('configurator.surfaceAlt', {
                                  title: material.title,
                                })
                              }
                              decoding="async"
                              draggable={false}
                              style={{
                                objectPosition: materialVisual?.objectPosition,
                              }}
                            />

                            {material.badge && (
                              <span
                                className={`configuratorMaterialBadge${
                                  materialVisual?.featured
                                    ? ' configuratorMaterialBadge--featured'
                                    : ''
                                }`}
                              >
                                {material.badge}
                              </span>
                            )}

                            {material.selected && (
                              <span
                                className="configuratorMaterialSelectedMark"
                                aria-hidden="true"
                              >
                                <svg viewBox="0 0 24 24">
                                  <path d="m7 12.5 3.2 3.2L17.5 8.5" />
                                </svg>
                              </span>
                            )}
                          </div>
                        )}

                        <div className="configuratorMaterialCardBody">
                          <div className="configuratorMaterialCardHeader">
                            <h3>{material.title}</h3>
                          </div>

                          <ul className="configuratorMaterialFeatures">
                            {material.properties.map((property) => (
                              <li key={`${material.id}-${property}`}>
                                {property}
                              </li>
                            ))}
                          </ul>

                          <div className="configuratorMaterialTotal">
                            <div>
                              <span>{t('configurator.price')}</span>
                            </div>
                            <strong>{material.calculatedPrice}</strong>
                          </div>

                          <button
                            type="button"
                            className="configuratorMaterialSelectButton"
                            disabled={!material.exists || isSelectionPending}
                            aria-pressed={material.selected}
                            aria-busy={isSelecting}
                            onClick={() => void handleMaterialSelect(material)}
                          >
                            <span>
                              {isSelecting
                                ? t('configurator.selecting')
                                : material.selected
                                  ? t('configurator.selectedContinue')
                                  : t('configurator.selectMaterial')}
                            </span>
                            {!isSelecting && (
                              <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="m9 18 6-6-6-6" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            </div>
            <div className="configuratorFlowFooter configuratorMaterialsActions">
              <ConfiguratorStepGuide step="materials" />
            </div>
          </>
        )}

        {step === 'preview' && (
          <>
            <div className="configuratorModalBody configuratorModalBody--preview">
              <ConfigratorScene2
                isOpen
                onClose={() => setStep('materials')}
                inline
                showCloseButton={false}
                imageUrl={imageUrl}
                widthCm={widthCm}
                heightCm={heightCm}
                crop={crop}
                selectedQualitySummary={selectedQualitySummary}
                totalPrice={selectedMaterial?.calculatedPrice}
              />
            </div>
            <div className="configuratorFlowFooter configuratorPreviewActions">
              <ConfiguratorStepGuide step="preview" />
              <div className="configuratorPreviewFooterAction">
                {confirmButton ?? (
                  <button type="button" className="configuratorPreviewButton">
                    {t('product.confirmAddToCart')}
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
