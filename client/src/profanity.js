import { Filter } from 'bad-words';
const NO_WORDS = [
    // Norwegian
    'faen', 'faan', 'helvete', 'jævla', 'jævlig', 'jævel', 'drit', 'dritten',
    'drittsekk', 'drittunge', 'kukk', 'pikk', 'kuk', 'fitte', 'fissen', 'fis',
    'røv', 'ræva', 'rævhøl', 'neger', 'svarting', 'homo', 'hore', 'ludder',
    'dust', 'idiot', 'tulling', 'tåpe', 'kuk', 'svina', 'satan', 'fy faen',
    'fordømt', 'hestkuk', 'hestefitte', 'møkk', 'møkkaunge',
];
const filter = new Filter();
filter.addWords(...NO_WORDS);
export function isProfane(text) {
    try {
        return filter.isProfane(text);
    }
    catch {
        return false;
    }
}
