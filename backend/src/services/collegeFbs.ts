/**
 * FBS schools (fix146): the seed for college levels when the provider's standings give no conference. 2025 FBS members
 * plus the names the provider may use for them (school name only; the nickname after it is ignored). A team's level is
 * timeless here (a school that moved up a few seasons ago counts as FBS in older seasons too).
 */
const FBS_SCHOOLS = [
  // ACC
  'Boston College', 'California', 'Cal', 'Clemson', 'Duke', 'Florida State', 'Georgia Tech', 'Louisville', 'Miami', 'Miami (FL)', 'NC State', 'North Carolina State',
  'North Carolina', 'Pittsburgh', 'Pitt', 'SMU', 'Southern Methodist', 'Stanford', 'Syracuse', 'Virginia', 'Virginia Tech', 'Wake Forest',
  // Big Ten
  'Illinois', 'Indiana', 'Iowa', 'Maryland', 'Michigan', 'Michigan State', 'Minnesota', 'Nebraska', 'Northwestern', 'Ohio State', 'Oregon', 'Penn State',
  'Purdue', 'Rutgers', 'UCLA', 'USC', 'Southern California', 'Washington', 'Wisconsin',
  // Big 12
  'Arizona', 'Arizona State', 'Baylor', 'BYU', 'Brigham Young', 'Cincinnati', 'Colorado', 'Houston', 'Iowa State', 'Kansas', 'Kansas State', 'Oklahoma State',
  'TCU', 'Texas Christian', 'Texas Tech', 'UCF', 'Central Florida', 'Utah', 'West Virginia',
  // SEC
  'Alabama', 'Arkansas', 'Auburn', 'Florida', 'Georgia', 'Kentucky', 'LSU', 'Louisiana State', 'Mississippi State', 'Missouri', 'Oklahoma', 'Ole Miss',
  'Mississippi', 'South Carolina', 'Tennessee', 'Texas', 'Texas A&M', 'Vanderbilt',
  // Pac-12
  'Oregon State', 'Washington State',
  // American
  'Army', 'Charlotte', 'East Carolina', 'Florida Atlantic', 'FAU', 'Memphis', 'Navy', 'North Texas', 'Rice', 'South Florida', 'USF', 'Temple', 'Tulane', 'Tulsa',
  'UAB', 'UTSA', 'UT San Antonio',
  // Mountain West
  'Air Force', 'Boise State', 'Colorado State', 'Fresno State', 'Hawaii', "Hawai'i", 'Nevada', 'New Mexico', 'San Diego State', 'San Jose State', 'San José State',
  'UNLV', 'Utah State', 'Wyoming',
  // Sun Belt
  'Appalachian State', 'App State', 'Arkansas State', 'Coastal Carolina', 'Georgia Southern', 'Georgia State', 'James Madison', 'Louisiana', 'Louisiana-Lafayette',
  'Louisiana-Monroe', 'Louisiana Monroe', 'UL Monroe', 'ULM', 'Marshall', 'Old Dominion', 'South Alabama', 'Southern Miss', 'Southern Mississippi', 'Texas State', 'Troy',
  // MAC
  'Akron', 'Ball State', 'Bowling Green', 'Buffalo', 'Central Michigan', 'Eastern Michigan', 'Kent State', 'Miami (OH)', 'Miami (Ohio)', 'Miami OH', 'Northern Illinois',
  'Ohio', 'Toledo', 'Western Michigan', 'UMass', 'Massachusetts',
  // Conference USA
  'Delaware', 'FIU', 'Florida International', 'Jacksonville State', 'Kennesaw State', 'Liberty', 'Louisiana Tech', 'Middle Tennessee', 'Middle Tennessee State',
  'Missouri State', 'New Mexico State', 'Sam Houston', 'Sam Houston State', 'UTEP', 'UT El Paso', 'Western Kentucky', 'WKU',
  // independents
  'Notre Dame', 'UConn', 'Connecticut'
];
/** First word of the rest of a name that means "another school" ("Texas Southern", "Alabama A&M", "Tennessee State"). */
const NOT_NICK = /^(state|southern|northern|eastern|western|central|north|south|east|west|a&m|a&t|tech|christian|international|atlantic|baptist|wesleyan|lutheran|methodist|college|university|valley|mountain|pacific|-|\(|st\.?|poly|mines|highlands|panhandle|riverside|monterey|pine|upstate|lafayette|martin|chattanooga|commerce|kingsville|permian|tyler|beaufort|aiken|county|dominican|union|duluth|mesa|morris|crookston|memorial|kearney|wesleyan|school|&|and|lynchburg)\b/i;
const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
const SCHOOLS = [...new Set(FBS_SCHOOLS.map(norm))].sort((a, b) => b.length - a.length);

/** Is this college team name an FBS school? The longest school that starts the name wins; the rest must be a nickname. */
export function isFbsName(name: string): boolean {
  const n = norm(name);
  for (const s of SCHOOLS) {
    if (n === s) return true;
    if (!n.startsWith(s + ' ')) continue;
    const rest = n.slice(s.length + 1);
    if (NOT_NICK.test(rest)) continue; // "texas southern tigers": another school
    if (rest.split(' ').length > 3) continue;
    return true;
  }
  return false;
}
