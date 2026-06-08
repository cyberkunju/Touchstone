"""
ICAO 9303 Machine-Readable Zone (MRZ) generator.

Produces VALID TD1/TD2/TD3 MRZ strings with correct check digits, ported from
the authoritative parser at `src/parsers/mrz.ts` (same weights [7,3,1] and
character-value table). Generating *valid* MRZs is a hard requirement: it fixes
the fake-MRZ problem seen in the AI-generated test specimens and lets the
verifier's check-digit path actually exercise real data.

Also supports deliberately INVALID variants (wrong check digit, OCR confusion,
dropped char) for verifier/robustness training, mirroring
SYNTHETIC_DATA_GENERATION.md §6.

Everything here is pure (given a seeded `random.Random`) and deterministic.
"""
from __future__ import annotations

import random
from dataclasses import dataclass

FILLER = "<"


def mrz_char_value(ch: str) -> int:
    """ICAO numeric value: 0-9 -> 0..9, A-Z -> 10..35, '<'/other -> 0."""
    if not ch:
        return 0
    code = ord(ch)
    if 48 <= code <= 57:  # '0'..'9'
        return code - 48
    if 65 <= code <= 90:  # 'A'..'Z'
        return code - 65 + 10
    return 0


def compute_check_digit(data: str) -> int:
    """ICAO check digit: weighted sum mod 10, weights cycle [7,3,1]."""
    weights = (7, 3, 1)
    total = 0
    for i, ch in enumerate(data):
        total += mrz_char_value(ch) * weights[i % 3]
    return total % 10


def _pad(value: str, length: int) -> str:
    """Uppercase, keep [A-Z0-9<], pad with filler or truncate to length."""
    cleaned = "".join(c for c in value.upper() if c.isalnum()).replace(" ", FILLER)
    cleaned = "".join(c if (c.isalnum()) else FILLER for c in cleaned)
    if len(cleaned) >= length:
        return cleaned[:length]
    return cleaned + FILLER * (length - len(cleaned))


def _name_field(surname: str, given: str, length: int) -> str:
    """Encode 'SURNAME<<GIVEN<NAMES' into a fixed-length name field."""
    def enc(s: str) -> str:
        s = "".join(c if c.isalpha() else " " for c in s.upper())
        return FILLER.join(p for p in s.split() if p)

    name = f"{enc(surname)}<<{enc(given)}"
    if len(name) >= length:
        return name[:length]
    return name + FILLER * (length - len(name))


@dataclass
class MrzResult:
    """A generated MRZ: the rendered lines plus the parsed source fields."""

    fmt: str  # 'TD1' | 'TD2' | 'TD3'
    lines: list[str]
    fields: dict


def _rand_date(rng: random.Random, lo_year: int, hi_year: int) -> str:
    """Random YYMMDD string within [lo_year, hi_year]."""
    year = rng.randint(lo_year, hi_year)
    month = rng.randint(1, 12)
    day = rng.randint(1, 28)
    return f"{year % 100:02d}{month:02d}{day:02d}"


def _rand_doc_number(rng: random.Random) -> str:
    alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    n = rng.randint(7, 9)
    return "".join(rng.choice(alphabet) for _ in range(n))


def generate_td3(rng: random.Random, fields: dict | None = None) -> MrzResult:
    """Generate a valid TD3 (2x44) passport MRZ."""
    f = dict(fields or {})
    country = f.get("issuingCountry", _rand_country(rng))
    nationality = f.get("nationality", country)
    surname = f.get("surname", _rand_surname(rng))
    given = f.get("givenNames", _rand_given(rng))
    doc_no = _pad(f.get("documentNumber", _rand_doc_number(rng)), 9)
    dob = f.get("dateOfBirth", _rand_date(rng, 1955, 2005))
    sex = f.get("sex", rng.choice("MFX"))
    expiry = f.get("expiryDate", _rand_date(rng, 25, 35))
    optional = _pad(f.get("optionalData", ""), 14)

    line1 = ("P" + FILLER + _pad(country, 3) + _name_field(surname, given, 39))[:44]
    line1 = line1 + FILLER * (44 - len(line1))

    doc_cd = compute_check_digit(doc_no)
    dob_cd = compute_check_digit(dob)
    exp_cd = compute_check_digit(expiry)
    opt_cd = compute_check_digit(optional)
    composite = doc_no + str(doc_cd) + dob + str(dob_cd) + expiry + str(exp_cd) + optional + str(opt_cd)
    comp_cd = compute_check_digit(composite)

    line2 = (
        doc_no + str(doc_cd) + _pad(nationality, 3)
        + dob + str(dob_cd) + sex + expiry + str(exp_cd)
        + optional + str(opt_cd) + str(comp_cd)
    )
    line2 = line2[:44] + FILLER * (44 - len(line2[:44]))

    return MrzResult(
        "TD3",
        [line1, line2],
        {
            "documentType": "P", "issuingCountry": country, "nationality": nationality,
            "surname": surname, "givenNames": given, "documentNumber": doc_no.replace(FILLER, ""),
            "dateOfBirth": dob, "sex": sex, "expiryDate": expiry,
        },
    )


def generate_td2(rng: random.Random, fields: dict | None = None) -> MrzResult:
    """Generate a valid TD2 (2x36) MRZ."""
    f = dict(fields or {})
    country = f.get("issuingCountry", _rand_country(rng))
    nationality = f.get("nationality", country)
    surname = f.get("surname", _rand_surname(rng))
    given = f.get("givenNames", _rand_given(rng))
    doc_no = _pad(f.get("documentNumber", _rand_doc_number(rng)), 9)
    dob = f.get("dateOfBirth", _rand_date(rng, 1955, 2005))
    sex = f.get("sex", rng.choice("MFX"))
    expiry = f.get("expiryDate", _rand_date(rng, 25, 35))

    line1 = ("I" + FILLER + _pad(country, 3) + _name_field(surname, given, 31))[:36]
    line1 = line1 + FILLER * (36 - len(line1))

    doc_cd = compute_check_digit(doc_no)
    dob_cd = compute_check_digit(dob)
    exp_cd = compute_check_digit(expiry)
    optional = _pad("", 7)
    composite = doc_no + str(doc_cd) + dob + str(dob_cd) + expiry + str(exp_cd) + optional
    comp_cd = compute_check_digit(composite)

    line2 = (
        doc_no + str(doc_cd) + _pad(nationality, 3) + dob + str(dob_cd)
        + sex + expiry + str(exp_cd) + optional + str(comp_cd)
    )
    line2 = line2[:36] + FILLER * (36 - len(line2[:36]))

    return MrzResult(
        "TD2", [line1, line2],
        {
            "documentType": "I", "issuingCountry": country, "nationality": nationality,
            "surname": surname, "givenNames": given, "documentNumber": doc_no.replace(FILLER, ""),
            "dateOfBirth": dob, "sex": sex, "expiryDate": expiry,
        },
    )


def generate_td1(rng: random.Random, fields: dict | None = None) -> MrzResult:
    """Generate a valid TD1 (3x30) ID-card MRZ."""
    f = dict(fields or {})
    country = f.get("issuingCountry", _rand_country(rng))
    nationality = f.get("nationality", country)
    surname = f.get("surname", _rand_surname(rng))
    given = f.get("givenNames", _rand_given(rng))
    doc_no = _pad(f.get("documentNumber", _rand_doc_number(rng)), 9)
    dob = f.get("dateOfBirth", _rand_date(rng, 1955, 2005))
    sex = f.get("sex", rng.choice("MFX"))
    expiry = f.get("expiryDate", _rand_date(rng, 25, 35))

    doc_cd = compute_check_digit(doc_no)
    opt1 = _pad("", 15)
    line1 = ("I" + FILLER + _pad(country, 3) + doc_no + str(doc_cd) + opt1)[:30]
    line1 = line1 + FILLER * (30 - len(line1))

    dob_cd = compute_check_digit(dob)
    exp_cd = compute_check_digit(expiry)
    opt2 = _pad("", 11)
    line2_core = dob + str(dob_cd) + sex + expiry + str(exp_cd) + _pad(nationality, 3) + opt2
    line2_core = line2_core[:29] + FILLER * (29 - len(line2_core[:29]))
    composite = (
        line1[5:30] + dob + str(dob_cd) + expiry + str(exp_cd) + opt2
    )
    comp_cd = compute_check_digit(composite)
    line2 = (line2_core + str(comp_cd))[:30]

    line3 = _name_field(surname, given, 30)

    return MrzResult(
        "TD1", [line1, line2, line3],
        {
            "documentType": "I", "issuingCountry": country, "nationality": nationality,
            "surname": surname, "givenNames": given, "documentNumber": doc_no.replace(FILLER, ""),
            "dateOfBirth": dob, "sex": sex, "expiryDate": expiry,
        },
    )


# Per-format critical fields: (line_index, data_start, data_end_exclusive,
# check_line, check_pos). These mirror the offsets in src/parsers/mrz.ts and are
# guaranteed to make the MRZ `invalid` (a critical check digit fails) when the
# data or its check digit is altered.
_CRITICAL: dict[str, list[tuple[int, int, int, int, int]]] = {
    "TD3": [(1, 0, 9, 1, 9), (1, 13, 19, 1, 19), (1, 21, 27, 1, 27)],
    "TD2": [(1, 0, 9, 1, 9), (1, 13, 19, 1, 19), (1, 21, 27, 1, 27)],
    "TD1": [(0, 5, 14, 0, 14), (1, 0, 6, 1, 6), (1, 8, 14, 1, 14)],
}


def corrupt(rng: random.Random, result: MrzResult) -> MrzResult:
    """Return an INVALID variant for verifier-robustness training.

    Deliberately targets a CRITICAL field (document number / DOB / expiry) so a
    check digit reliably fails, then applies one of: wrong check digit, OCR
    confusion (O<->0, I<->1...), or a dropped character. The fields dict is
    tagged `invalid=True`. This is exactly the kind of input the verifier must
    flag rather than silently accept.
    """
    lines = [list(line) for line in result.lines]
    fields = dict(result.fields)
    targets = _CRITICAL.get(result.fmt)
    if not targets:
        fields["invalid"] = True
        return MrzResult(result.fmt, result.lines, fields)

    li, d0, d1, cl, cp = rng.choice(targets)
    mode = rng.choice(["check", "confuse", "drop"])

    def differs() -> bool:
        data = "".join(lines[li][d0:d1])
        return compute_check_digit(data) != (int(lines[cl][cp]) if lines[cl][cp].isdigit() else -1)

    if mode == "check":
        # Force the check digit to a wrong value.
        cur = lines[cl][cp]
        correct = compute_check_digit("".join(lines[li][d0:d1]))
        lines[cl][cp] = str((correct + 1 + rng.randint(0, 7)) % 10)
    else:
        # Mutate a data cell; if that happens to leave the check consistent
        # (rare), also bump the check digit to guarantee invalidity.
        pos = rng.randrange(d0, d1)
        ch = lines[li][pos]
        if mode == "confuse":
            conf = {"O": "0", "0": "O", "I": "1", "1": "I", "B": "8", "8": "B",
                    "S": "5", "5": "S", "<": "0"}
            lines[li][pos] = conf.get(ch, "0" if ch.isalpha() else "X")
        else:  # drop
            lines[li][pos] = FILLER if ch != FILLER else "0"
        if not differs():
            correct = compute_check_digit("".join(lines[li][d0:d1]))
            lines[cl][cp] = str((correct + 1) % 10)

    fields["invalid"] = True
    return MrzResult(result.fmt, ["".join(c) for c in lines], fields)


# --- small fake-content pools (privacy-safe, clearly synthetic) ---------------

_SURNAMES = [
    "ANDERSSON", "MARTINEZ", "KOWALSKI", "NAKAMURA", "OKAFOR", "SILVA",
    "MUELLER", "ROSSI", "DUBOIS", "NOVAK", "HUSSEIN", "PETROV", "TANAKA",
    "SCHMIDT", "GARCIA", "OBRIEN", "KUMAR", "ALMASRI", "LINDQVIST",
]
_GIVEN = [
    "MARIA", "JOHN", "ANNA", "YUKI", "CHIDI", "LUCAS", "SOFIA", "OMAR",
    "ELENA", "DANIEL", "AISHA", "PETER", "NORA", "IVAN", "GRACE", "HASSAN",
]
# Use a mix of real ICAO codes and clearly-fictional codes (UTO is the ICAO
# specimen "Utopia" code) so public datasets are not mistaken for real docs.
_COUNTRIES = [
    "UTO", "SWE", "DEU", "FRA", "JPN", "BRA", "NGA", "POL", "ITA", "CAN",
    "IND", "ARE", "EGY", "RUS", "ESP", "USA", "GBR", "ZAF", "MEX", "AUS",
]


def _rand_surname(rng: random.Random) -> str:
    return rng.choice(_SURNAMES)


def _rand_given(rng: random.Random) -> str:
    n = rng.randint(1, 2)
    return " ".join(rng.choice(_GIVEN) for _ in range(n))


def _rand_country(rng: random.Random) -> str:
    return rng.choice(_COUNTRIES)


def generate(rng: random.Random, fmt: str = "TD3", fields: dict | None = None) -> MrzResult:
    """Dispatch to the requested format generator."""
    if fmt == "TD1":
        return generate_td1(rng, fields)
    if fmt == "TD2":
        return generate_td2(rng, fields)
    return generate_td3(rng, fields)


def _strip(s: str) -> str:
    """Trim ICAO filler and surrounding whitespace from a raw field."""
    return s.replace(FILLER, " ").strip().replace("  ", " ")


def _decode_name(field: str) -> tuple[str, str]:
    """Decode a 'SURNAME<<GIVEN<NAMES' name field into (surname, givenNames)."""
    surname, _, given = field.partition("<<")
    return _strip(surname), _strip(given)


def parse(fmt: str, lines: list[str]) -> dict:
    """Parse MRZ `lines` into raw fields WITHOUT validating check digits.

    This reflects exactly what is printed on the strip — including OCR/forgery
    corruption — so corrupted specimens get ground truth that matches the
    pixels rather than the pristine source data. The `valid` flag and check-
    digit logic live in the verifier (src/parsers/mrz.ts); here we only read.
    """
    f: dict = {"format": fmt}
    try:
        if fmt in ("TD3", "TD2"):
            l1, l2 = lines[0], lines[1]
            f["documentType"] = _strip(l1[0:2])
            f["issuingCountry"] = _strip(l1[2:5])
            name_len = 39 if fmt == "TD3" else 31
            surname, given = _decode_name(l1[5:5 + name_len])
            f["surname"], f["givenNames"] = surname, given
            f["documentNumber"] = _strip(l2[0:9])
            f["nationality"] = _strip(l2[10:13])
            f["dateOfBirth"] = _strip(l2[13:19])
            f["sex"] = _strip(l2[20:21])
            f["expiryDate"] = _strip(l2[21:27])
        elif fmt == "TD1":
            l1, l2, l3 = lines[0], lines[1], lines[2]
            f["documentType"] = _strip(l1[0:2])
            f["issuingCountry"] = _strip(l1[2:5])
            f["documentNumber"] = _strip(l1[5:14])
            f["dateOfBirth"] = _strip(l2[0:6])
            f["sex"] = _strip(l2[7:8])
            f["expiryDate"] = _strip(l2[8:14])
            f["nationality"] = _strip(l2[15:18])
            surname, given = _decode_name(l3[0:30])
            f["surname"], f["givenNames"] = surname, given
    except (IndexError, ValueError):  # malformed/short lines -> best effort
        pass
    return f
