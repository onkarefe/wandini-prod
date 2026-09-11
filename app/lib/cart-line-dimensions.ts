import {
  CONFIGURATOR_PAYLOAD_ATTRIBUTE,
  parseConfiguratorPayload,
} from '~/lib/configurator-pricing';

type CartLineDimensionAttribute = {
  key: string;
  value?: string | null;
};

export function getCartLineDimensionText(
  attributes: ReadonlyArray<CartLineDimensionAttribute> | null | undefined,
): string | null {
  const payloadAttribute = attributes?.find(
    (attribute) => attribute.key === CONFIGURATOR_PAYLOAD_ATTRIBUTE,
  );
  const payload = parseConfiguratorPayload(payloadAttribute?.value);

  if (!payload) return null;

  const widthCm = payload.output.width / 10;
  const heightCm = payload.output.height / 10;

  return `${widthCm} cm x ${heightCm} cm`;
}
