import { ApiError } from '../api/http';
import { getGlobalLanguage, translate } from '../i18n/translations';
import { friendlyErrorMessage } from './errors';

// User-facing message for barcode lookup API failures.
export function friendlyBarcodeLookupError(err: unknown): string {
  const lang = getGlobalLanguage();
  if (err instanceof ApiError) {
    if (err.status === 400) {
      return translate('errors.barcodeInvalid', lang);
    }
    if (err.code === 'NOT_IN_CURATED_CATALOGUE') {
      // A real, scannable product that this curated prototype catalogue does
      // not include (curated mode), distinct from an unknown code.
      return translate('errors.barcodeNotInCatalogue', lang);
    }
    if (err.status === 404) {
      return translate('errors.barcodeNotFound', lang);
    }
    if (err.status === 409) {
      return translate('errors.barcodeDuplicate', lang);
    }
  }
  return friendlyErrorMessage(err);
}
