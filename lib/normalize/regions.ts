/**
 * Справочник синонимов городов → region_code (раздел 4.3).
 * Пополняется в коде; админка показывает нераспознанные значения.
 */
export const REGION_SYNONYMS: Record<string, string> = {
  // Москва
  'мск': 'msk', 'москва': 'msk', 'моск обл': 'msk', 'московская обл': 'msk',
  // Казань
  'кзн': 'kzn', 'казань': 'kzn',
  // Татарстан
  'рт': 'rt', 'рт челны': 'rt', 'рт, зеленодольск': 'rt', 'челны': 'rt', 'елабуга': 'rt',
  'татарстан': 'rt', 'набережные челны': 'rt', 'нижнекамск': 'rt', 'альметьевск': 'rt',
  // Нижний Новгород
  'нн': 'nn', 'нижний': 'nn', 'но': 'nn', 'нижний новгород': 'nn',
  'екб': 'ekb', 'екатеринбург': 'ekb', 'свердловская': 'ekb',
  'спб': 'spb', 'питер': 'spb', 'санкт-петербург': 'spb', 'петербург': 'spb',
  // Башкортостан
  'уфа': 'rb', 'рб': 'rb', 'рб стерлитамак': 'rb', 'нефтекамск рб': 'rb',
  'башкортостан': 'rb', 'башкирия': 'rb', 'стерлитамак': 'rb',
  'киров': 'kirov', 'кир обл': 'kirov', 'кировская': 'kirov',
  'новосиб': 'nsk', 'новосибирск': 'nsk',
  'тюмень': 'tmn', 'тюменская': 'tmn',
  'пермь': 'perm', 'пермский': 'perm',
  'самара': 'samara', 'самарская': 'samara', 'тольятти': 'samara',
  'саратов': 'saratov', 'саратовская': 'saratov',
  'ульяновск': 'uln', 'ульяновская': 'uln',
  'ижевск': 'izh', 'удмуртия': 'izh',
  'саранск': 'mordovia', 'мордовия': 'mordovia',
  'чувашия': 'chuv', 'чебоксары': 'chuv',
  'йошка': 'mari', 'марий эл': 'mari', 'йошкар-ола': 'mari', 'йошкар ола': 'mari',
  'владик': 'vld', 'владивосток': 'vld', 'приморский': 'vld',
  'миас (челяб)': 'chel', 'магнитогорск': 'chel', 'челябинск': 'chel', 'челябинская': 'chel', 'миасс': 'chel',
  'оренбург': 'oren', 'оренбургская': 'oren',
  'белгород': 'bel', 'белгородская': 'bel',
  'краснодар': 'krasnodar', 'сочи': 'krasnodar', 'анапа': 'krasnodar', 'краснодарский': 'krasnodar', 'кубань': 'krasnodar',
  'череповец': 'vologda', 'вологда': 'vologda', 'вологодская': 'vologda',
  'иваново': 'ivanovo', 'ивановская': 'ivanovo',
  'ноябрьск': 'yanao', 'янао': 'yanao', 'ямал': 'yanao', 'салехард': 'yanao', 'новый уренгой': 'yanao',
  'назрань': 'kavkaz', 'чечня': 'kavkaz', 'кавказ': 'kavkaz', 'северный кавказ': 'kavkaz',
  'ингушетия': 'kavkaz', 'дагестан': 'kavkaz', 'махачкала': 'kavkaz', 'грозный': 'kavkaz',
  'кузбасс': 'kem', 'кемерово': 'kem', 'кемеровская': 'kem', 'новокузнецк': 'kem',
  'барнаул': 'altai', 'алтай': 'altai', 'алтайский': 'altai',
  'пенза': 'penza', 'пензенская': 'penza',
  'рт, заинск': 'rt', 'заинск': 'rt',
  'москва и мо': 'msk', 'московская область': 'msk', 'подмосковье': 'msk',
  'пермский край': 'perm',
};

/**
 * Код региона по KLADR-идентификатору из ЕГРЮЛ (DaData).
 * Казань выделена отдельным кодом (как в справочнике заказчика),
 * остальной Татарстан → rt.
 */
const KLADR_TO_REGION: Record<string, string> = {
  '16': 'rt', '63': 'samara', '43': 'kirov', '59': 'perm', '77': 'msk',
  '50': 'msk', '18': 'izh', '66': 'ekb', '52': 'nn', '54': 'nsk',
  '74': 'chel', '12': 'mari', '02': 'rb', '13': 'mordovia', '73': 'uln',
  '22': 'altai', '56': 'oren', '78': 'spb', '35': 'vologda', '06': 'kavkaz',
  '20': 'kavkaz', '05': 'kavkaz', '72': 'tmn', '64': 'saratov', '42': 'kem',
  '21': 'chuv', '25': 'vld', '31': 'bel', '23': 'krasnodar', '37': 'ivanovo',
  '89': 'yanao', '58': 'penza',
};

export function regionFromKladr(
  kladrId: string | null | undefined,
  city?: string | null,
): string | null {
  if (!kladrId) return null;
  const code = KLADR_TO_REGION[kladrId.slice(0, 2)];
  if (!code) return null;
  // Казань — отдельный код в справочнике заказчика
  if (code === 'rt' && city && /казан/i.test(city)) return 'kzn';
  return code;
}

/** Человекочитаемые названия регионов — для обезличенных карточек (INV-4) и админки. */
export const REGION_NAMES: Record<string, string> = {
  msk: 'Москва и МО',
  kzn: 'Казань',
  rt: 'Татарстан',
  nn: 'Нижний Новгород',
  ekb: 'Екатеринбург',
  spb: 'Санкт-Петербург',
  rb: 'Башкортостан',
  kirov: 'Кировская область',
  nsk: 'Новосибирск',
  tmn: 'Тюмень',
  perm: 'Пермский край',
  samara: 'Самара',
  saratov: 'Саратовская область',
  uln: 'Ульяновск',
  izh: 'Ижевск',
  mordovia: 'Мордовия',
  chuv: 'Чувашия',
  mari: 'Марий Эл',
  vld: 'Владивосток',
  chel: 'Челябинская область',
  oren: 'Оренбург',
  bel: 'Белгород',
  krasnodar: 'Краснодарский край',
  vologda: 'Вологодская область',
  ivanovo: 'Иваново',
  yanao: 'ЯНАО',
  kavkaz: 'Северный Кавказ',
  kem: 'Кузбасс',
  altai: 'Алтайский край',
  penza: 'Пенза',
};

export function regionName(code: string | null | undefined): string | null {
  if (!code) return null;
  return REGION_NAMES[code] ?? code;
}

/**
 * Определяет регион по свободному тексту пользователя
 * («Татарстан», «Казань», «рт», «Санкт-Петербург»).
 */
export function regionFromText(text: string): string | null {
  const key = text.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();

  // точное совпадение с синонимом
  if (REGION_SYNONYMS[key]) return REGION_SYNONYMS[key];

  // точное совпадение с названием из списка «Регионы» («Татарстан», «Москва и МО»)
  for (const [code, name] of Object.entries(REGION_NAMES)) {
    if (key === name.toLowerCase()) return code;
  }

  // вхождение: короткие синонимы («рт», «нн», «но») — только как отдельное слово,
  // иначе «Татарстан» ловился бы на «рт», а «Новосибирск» — на «но»;
  // длинные сравниваем по основе (без последней буквы), чтобы ловить склонения
  // («в казани», «по татарстану»)
  const words = key.split(/[^а-яa-z0-9]+/).filter(Boolean);
  const stem = (s: string) => (s.length >= 5 ? s.slice(0, -1) : s);
  for (const [syn, code] of Object.entries(REGION_SYNONYMS)) {
    if (syn.length >= 4 ? key.includes(stem(syn)) : words.includes(syn)) return code;
  }
  for (const [code, name] of Object.entries(REGION_NAMES)) {
    if (key.includes(stem(name.toLowerCase()))) return code;
  }
  return null;
}
