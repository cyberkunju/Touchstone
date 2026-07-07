/**
 * MRZ-derived authoritative field descriptors.
 *
 * For passports and ID cards the Machine-Readable Zone (MRZ) is the
 * checksum-protected source of truth. Visual OCR of the printed document
 * is comparatively noisy, so the fields produced here are intended to
 * override visually-extracted values.
 *
 * This module converts a parsed {@link MrzParseResult} into a list of
 * {@link MrzDerivedField} descriptors. Each descriptor carries a
 * confidence that is derived from whether the relevant ICAO check digit
 * passed: fields guarded by a passing dedicated check digit are trusted
 * the most, fields guarded only by the composite check digit slightly
 * less, and fields whose check digit failed are flagged for review.
 */

import { MrzParseResult, MrzCheckDigitResult } from '../parsers/mrz';
import { FieldValueType } from '../core/types';

/**
 * A single authoritative field derived from an MRZ. The `value` is
 * human-friendly (e.g. a country name rather than a 3-letter code) and
 * the `confidence` is checksum-aware.
 */
export interface MrzDerivedField {
  /** Stable canonical identifier for the field. */
  canonicalLabel: string;
  /** Human-readable display label. */
  label: string;
  /** Semantic value type used downstream. */
  valueType: FieldValueType;
  /** Human-friendly value string. */
  value: string;
  /** Confidence in `[0, 1]`, derived from check-digit results. */
  confidence: number;
  /**
   * Whether the relevant check digit passed: `true`/`false` when a
   * relevant check digit exists, `null` when none is applicable.
   */
  checksumPassed: boolean | null;
  /** Always `'mrz'`; identifies the provenance of this field. */
  source: 'mrz';
}

/**
 * Comprehensive ISO 3166-1 alpha-3 country code -> English name map,
 * plus MRZ-specific / legacy / special codes defined by ICAO 9303.
 */
const COUNTRY_NAMES: Readonly<Record<string, string>> = {
  ABW: 'Aruba',
  AFG: 'Afghanistan',
  AGO: 'Angola',
  AIA: 'Anguilla',
  ALA: 'Åland Islands',
  ALB: 'Albania',
  AND: 'Andorra',
  ARE: 'United Arab Emirates',
  ARG: 'Argentina',
  ARM: 'Armenia',
  ASM: 'American Samoa',
  ATA: 'Antarctica',
  ATF: 'French Southern Territories',
  ATG: 'Antigua and Barbuda',
  AUS: 'Australia',
  AUT: 'Austria',
  AZE: 'Azerbaijan',
  BDI: 'Burundi',
  BEL: 'Belgium',
  BEN: 'Benin',
  BES: 'Bonaire, Sint Eustatius and Saba',
  BFA: 'Burkina Faso',
  BGD: 'Bangladesh',
  BGR: 'Bulgaria',
  BHR: 'Bahrain',
  BHS: 'Bahamas',
  BIH: 'Bosnia and Herzegovina',
  BLM: 'Saint Barthélemy',
  BLR: 'Belarus',
  BLZ: 'Belize',
  BMU: 'Bermuda',
  BOL: 'Bolivia',
  BRA: 'Brazil',
  BRB: 'Barbados',
  BRN: 'Brunei Darussalam',
  BTN: 'Bhutan',
  BVT: 'Bouvet Island',
  BWA: 'Botswana',
  CAF: 'Central African Republic',
  CAN: 'Canada',
  CCK: 'Cocos (Keeling) Islands',
  CHE: 'Switzerland',
  CHL: 'Chile',
  CHN: 'China',
  CIV: "Côte d'Ivoire",
  CMR: 'Cameroon',
  COD: 'Democratic Republic of the Congo',
  COG: 'Congo',
  COK: 'Cook Islands',
  COL: 'Colombia',
  COM: 'Comoros',
  CPV: 'Cabo Verde',
  CRI: 'Costa Rica',
  CUB: 'Cuba',
  CUW: 'Curaçao',
  CXR: 'Christmas Island',
  CYM: 'Cayman Islands',
  CYP: 'Cyprus',
  CZE: 'Czechia',
  DEU: 'Germany',
  DJI: 'Djibouti',
  DMA: 'Dominica',
  DNK: 'Denmark',
  DOM: 'Dominican Republic',
  DZA: 'Algeria',
  ECU: 'Ecuador',
  EGY: 'Egypt',
  ERI: 'Eritrea',
  ESH: 'Western Sahara',
  ESP: 'Spain',
  EST: 'Estonia',
  ETH: 'Ethiopia',
  FIN: 'Finland',
  FJI: 'Fiji',
  FLK: 'Falkland Islands',
  FRA: 'France',
  FRO: 'Faroe Islands',
  FSM: 'Micronesia',
  GAB: 'Gabon',
  GBR: 'United Kingdom',
  GEO: 'Georgia',
  GGY: 'Guernsey',
  GHA: 'Ghana',
  GIB: 'Gibraltar',
  GIN: 'Guinea',
  GLP: 'Guadeloupe',
  GMB: 'Gambia',
  GNB: 'Guinea-Bissau',
  GNQ: 'Equatorial Guinea',
  GRC: 'Greece',
  GRD: 'Grenada',
  GRL: 'Greenland',
  GTM: 'Guatemala',
  GUF: 'French Guiana',
  GUM: 'Guam',
  GUY: 'Guyana',
  HKG: 'Hong Kong',
  HMD: 'Heard Island and McDonald Islands',
  HND: 'Honduras',
  HRV: 'Croatia',
  HTI: 'Haiti',
  HUN: 'Hungary',
  IDN: 'Indonesia',
  IMN: 'Isle of Man',
  IND: 'India',
  IOT: 'British Indian Ocean Territory',
  IRL: 'Ireland',
  IRN: 'Iran',
  IRQ: 'Iraq',
  ISL: 'Iceland',
  ISR: 'Israel',
  ITA: 'Italy',
  JAM: 'Jamaica',
  JEY: 'Jersey',
  JOR: 'Jordan',
  JPN: 'Japan',
  KAZ: 'Kazakhstan',
  KEN: 'Kenya',
  KGZ: 'Kyrgyzstan',
  KHM: 'Cambodia',
  KIR: 'Kiribati',
  KNA: 'Saint Kitts and Nevis',
  KOR: 'South Korea',
  KWT: 'Kuwait',
  LAO: 'Laos',
  LBN: 'Lebanon',
  LBR: 'Liberia',
  LBY: 'Libya',
  LCA: 'Saint Lucia',
  LIE: 'Liechtenstein',
  LKA: 'Sri Lanka',
  LSO: 'Lesotho',
  LTU: 'Lithuania',
  LUX: 'Luxembourg',
  LVA: 'Latvia',
  MAC: 'Macao',
  MAF: 'Saint Martin (French part)',
  MAR: 'Morocco',
  MCO: 'Monaco',
  MDA: 'Moldova',
  MDG: 'Madagascar',
  MDV: 'Maldives',
  MEX: 'Mexico',
  MHL: 'Marshall Islands',
  MKD: 'North Macedonia',
  MLI: 'Mali',
  MLT: 'Malta',
  MMR: 'Myanmar',
  MNE: 'Montenegro',
  MNG: 'Mongolia',
  MNP: 'Northern Mariana Islands',
  MOZ: 'Mozambique',
  MRT: 'Mauritania',
  MSR: 'Montserrat',
  MTQ: 'Martinique',
  MUS: 'Mauritius',
  MWI: 'Malawi',
  MYS: 'Malaysia',
  MYT: 'Mayotte',
  NAM: 'Namibia',
  NCL: 'New Caledonia',
  NER: 'Niger',
  NFK: 'Norfolk Island',
  NGA: 'Nigeria',
  NIC: 'Nicaragua',
  NIU: 'Niue',
  NLD: 'Netherlands',
  NOR: 'Norway',
  NPL: 'Nepal',
  NRU: 'Nauru',
  NZL: 'New Zealand',
  OMN: 'Oman',
  PAK: 'Pakistan',
  PAN: 'Panama',
  PCN: 'Pitcairn',
  PER: 'Peru',
  PHL: 'Philippines',
  PLW: 'Palau',
  PNG: 'Papua New Guinea',
  POL: 'Poland',
  PRI: 'Puerto Rico',
  PRK: 'North Korea',
  PRT: 'Portugal',
  PRY: 'Paraguay',
  PSE: 'Palestine',
  PYF: 'French Polynesia',
  QAT: 'Qatar',
  REU: 'Réunion',
  ROU: 'Romania',
  RUS: 'Russian Federation',
  RWA: 'Rwanda',
  SAU: 'Saudi Arabia',
  SDN: 'Sudan',
  SEN: 'Senegal',
  SGP: 'Singapore',
  SGS: 'South Georgia and the South Sandwich Islands',
  SHN: 'Saint Helena, Ascension and Tristan da Cunha',
  SJM: 'Svalbard and Jan Mayen',
  SLB: 'Solomon Islands',
  SLE: 'Sierra Leone',
  SLV: 'El Salvador',
  SMR: 'San Marino',
  SOM: 'Somalia',
  SPM: 'Saint Pierre and Miquelon',
  SRB: 'Serbia',
  SSD: 'South Sudan',
  STP: 'Sao Tome and Principe',
  SUR: 'Suriname',
  SVK: 'Slovakia',
  SVN: 'Slovenia',
  SWE: 'Sweden',
  SWZ: 'Eswatini',
  SXM: 'Sint Maarten (Dutch part)',
  SYC: 'Seychelles',
  SYR: 'Syrian Arab Republic',
  TCA: 'Turks and Caicos Islands',
  TCD: 'Chad',
  TGO: 'Togo',
  THA: 'Thailand',
  TJK: 'Tajikistan',
  TKL: 'Tokelau',
  TKM: 'Turkmenistan',
  TLS: 'Timor-Leste',
  TON: 'Tonga',
  TTO: 'Trinidad and Tobago',
  TUN: 'Tunisia',
  TUR: 'Türkiye',
  TUV: 'Tuvalu',
  TWN: 'Taiwan',
  TZA: 'Tanzania',
  UGA: 'Uganda',
  UKR: 'Ukraine',
  UMI: 'United States Minor Outlying Islands',
  URY: 'Uruguay',
  USA: 'United States',
  UZB: 'Uzbekistan',
  VAT: 'Holy See',
  VCT: 'Saint Vincent and the Grenadines',
  VEN: 'Venezuela',
  VGB: 'British Virgin Islands',
  VIR: 'U.S. Virgin Islands',
  VNM: 'Viet Nam',
  VUT: 'Vanuatu',
  WLF: 'Wallis and Futuna',
  WSM: 'Samoa',
  YEM: 'Yemen',
  ZAF: 'South Africa',
  ZMB: 'Zambia',
  ZWE: 'Zimbabwe',

  // --- MRZ special / legacy / organization codes (ICAO 9303) ---
  D: 'Germany',
  UNO: 'United Nations',
  UNA: 'United Nations',
  UNK: 'United Nations',
  XXA: 'Stateless',
  XXB: 'Refugee',
  XXC: 'Refugee (non-convention)',
  XXX: 'Unspecified',
  EUE: 'European Union',
  GBD: 'British Overseas Territories Citizen',
  GBN: 'British National (Overseas)',
  GBO: 'British Overseas Citizen',
  GBP: 'British Protected Person',
  GBS: 'British Subject',
};

/**
 * Resolve an ISO 3166-1 alpha-3 (or MRZ special) country code to its
 * English name. Input is trimmed and uppercased before lookup. Unknown
 * codes are returned unchanged (no fabrication).
 *
 * @param code A country code, e.g. `'IND'` or `'d'`.
 * @returns The English country name, or the cleaned input when unknown.
 */
export function countryName(code: string): string {
  const key = code.trim().toUpperCase();
  return COUNTRY_NAMES[key] ?? key;
}

/**
 * Find the check-digit result whose `field` matches the given key, and
 * return its `passed` flag. Matching is by exact equality first, then by
 * substring containment to tolerate field naming variants.
 *
 * @param checks All check-digit results from the parse.
 * @param key The logical field key to look up.
 * @returns The `passed` flag, or `null` when no matching result exists.
 */
function checksumFor(
  checks: readonly MrzCheckDigitResult[],
  key: string,
): boolean | null {
  const lowerKey = key.toLowerCase();
  const exact = checks.find((c) => c.field === key);
  if (exact !== undefined) {
    return exact.passed;
  }
  const fuzzy = checks.find((c) => {
    const f = c.field.toLowerCase();
    return f === lowerKey || f.includes(lowerKey) || lowerKey.includes(f);
  });
  return fuzzy !== undefined ? fuzzy.passed : null;
}

/**
 * Compute a checksum-aware confidence for a field.
 *
 * @param specific The `passed` flag of the field's dedicated check digit,
 *                 or `null` when the field has no dedicated check digit.
 * @param composite The `passed` flag of the composite check digit, or
 *                   `null` when absent.
 * @param statusValid Whether the overall MRZ status is `'valid'`.
 * @returns A confidence in `[0, 1]`.
 */
function computeConfidence(
  specific: boolean | null,
  composite: boolean | null,
  statusValid: boolean,
): number {
  let confidence: number;
  if (specific === true) {
    confidence = 0.99;
  } else if (specific === false) {
    confidence = 0.55;
  } else if (composite === true) {
    confidence = 0.97;
  } else if (composite === false) {
    confidence = 0.6;
  } else {
    confidence = 0.9;
  }
  if (statusValid && confidence < 0.95) {
    confidence = 0.95;
  }
  return confidence;
}

/** Internal spec describing how to build one derived field. */
interface FieldSpec {
  canonicalLabel: string;
  label: string;
  valueType: FieldValueType;
  value: string;
  /** Dedicated check-digit key, or `null` to rely on the composite. */
  specificKey: string | null;
}

/**
 * Convert a parsed MRZ into a list of authoritative {@link MrzDerivedField}
 * descriptors. Only fields whose underlying MRZ value is present and
 * non-empty are emitted. The resulting list is ordered:
 * passport_number, full_name, surname, given_names, nationality,
 * date_of_birth, sex, date_of_expiry.
 *
 * @param mrz A parsed MRZ result.
 * @returns The derived fields, or `[]` when the format is unknown.
 */
export function mrzToFields(mrz: MrzParseResult): MrzDerivedField[] {
  if (mrz.format === 'unknown' || mrz.status === undefined) {
    return [];
  }

  const f = mrz.fields;
  const checks = mrz.checkDigits ?? [];
  const composite = checksumFor(checks, 'composite');
  const statusValid = mrz.status === 'valid';

  const nonEmpty = (v: string | undefined): v is string =>
    typeof v === 'string' && v.trim().length > 0;

  const specs: FieldSpec[] = [];

  if (nonEmpty(f.documentNumber)) {
    specs.push({
      canonicalLabel: 'passport_number',
      label: 'Passport Number',
      valueType: 'id_number',
      value: f.documentNumber,
      specificKey: 'documentNumber',
    });
  }

  const hasGiven = nonEmpty(f.givenNames);
  const hasSurname = nonEmpty(f.surname);
  if (hasGiven || hasSurname) {
    const fullName = `${f.givenNames ?? ''} ${f.surname ?? ''}`.trim();
    specs.push({
      canonicalLabel: 'full_name',
      label: 'Full Name',
      valueType: 'name',
      value: fullName,
      specificKey: null,
    });
  }

  if (hasSurname) {
    specs.push({
      canonicalLabel: 'surname',
      label: 'Surname',
      valueType: 'name',
      value: f.surname as string,
      specificKey: null,
    });
  }

  if (hasGiven) {
    specs.push({
      canonicalLabel: 'given_names',
      label: 'Given Names',
      valueType: 'name',
      value: f.givenNames as string,
      specificKey: null,
    });
  }

  if (nonEmpty(f.nationality)) {
    specs.push({
      canonicalLabel: 'nationality',
      label: 'Nationality',
      valueType: 'country',
      value: countryName(f.nationality),
      specificKey: null,
    });
  }

  if (nonEmpty(f.dateOfBirth)) {
    specs.push({
      canonicalLabel: 'date_of_birth',
      label: 'Date of Birth',
      valueType: 'date',
      value: f.dateOfBirth,
      specificKey: 'dateOfBirth',
    });
  }

  if (nonEmpty(f.sex)) {
    specs.push({
      canonicalLabel: 'sex',
      label: 'Sex',
      valueType: 'text',
      value: f.sex as string,
      specificKey: null,
    });
  }

  if (nonEmpty(f.expiryDate)) {
    specs.push({
      canonicalLabel: 'date_of_expiry',
      label: 'Date of Expiry',
      valueType: 'date',
      value: f.expiryDate,
      specificKey: 'expiryDate',
    });
  }

  if (nonEmpty(f.documentType)) {
    specs.push({
      canonicalLabel: 'document_type',
      label: 'Type',
      valueType: 'text',
      value: f.documentType,
      specificKey: null,
    });
  }

  if (nonEmpty(f.issuingCountry)) {
    specs.push({
      canonicalLabel: 'country_code',
      label: 'Country Code',
      valueType: 'text',
      value: f.issuingCountry,
      specificKey: null,
    });
  }

  return specs.map((spec) => {
    const specific = spec.specificKey !== null
      ? checksumFor(checks, spec.specificKey)
      : null;
    // CHECKSUM HONESTY (live-caught silent error): fields WITHOUT a dedicated
    // check digit (names, nationality, sex, issuing state) are NOT covered by
    // the composite check either — ICAO's composite spans only the
    // checksummed data fields. Claiming `composite` for them promoted a
    // misread country code ("XCO") as checksum-proven. Uncovered fields carry
    // `null` (unknown), never `true`.
    const checksumPassed = specific;
    return {
      canonicalLabel: spec.canonicalLabel,
      label: spec.label,
      valueType: spec.valueType,
      value: spec.value,
      confidence: computeConfidence(specific, composite, statusValid),
      checksumPassed,
      source: 'mrz' as const,
    };
  });
}
