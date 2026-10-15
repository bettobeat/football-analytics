/**
 * Search descriptions and titles in the page's own language (fix124, Oct 2026). A description is one full sentence of
 * 140–155 characters, built from facts clause by clause (a clause goes in only if it fits), so it never stops
 * mid-word or ends with "…". Never the pick or a percentage.
 */
export type Lang = 'en' | 'es' | 'pt' | 'de' | 'fr' | 'it' | 'tr';
const LOCALE: Record<Lang, string> = { en: 'en-GB', es: 'es-ES', pt: 'pt-PT', de: 'de-DE', fr: 'fr-FR', it: 'it-IT', tr: 'tr-TR' };

interface Pack {
  form: string; lastMeeting: string; absences: string; table: string; record: string; thisWeek: string; leader: string; next: string;
  fbTails: string[]; bbTails: string[]; teamTails: string[]; leagueTails: string[];
  fbFill: string[]; bbFill: string[]; teamFill: string[]; leagueFill: string[];
  wdl: { W: string; D: string; L: string };
  prediction: string; previewTitle: string; predictions: string; tableStats: string; nextAndForm: string; today: string; todayBb: string;
}
const P: Record<Lang, Pack> = {
  en: {
    form: 'form', lastMeeting: 'last meeting', absences: 'key absences', table: 'in the table', record: 'records', thisWeek: 'games this week', leader: 'leader', next: 'next',
    fbTails: ['Free preview and our double-chance pick.', 'Free preview and our pick.', 'Free preview.'],
    bbTails: ['Free preview, point spread and our pick.', 'Free preview and our pick.', 'Free preview.'],
    teamTails: ['Fixtures, results, form and our predictions.', 'Fixtures, results and predictions.', 'Predictions.'],
    leagueTails: ['Table, fixtures and our predictions for every game.', 'Table, fixtures and predictions.', 'Predictions.'],
    fbFill: ['head-to-head', 'expected goals', 'line-ups', 'rest days', 'league table', 'team news'], bbFill: ['head-to-head', 'rest days', 'key players', 'total points', 'home and away record', 'recent results'],
    teamFill: ['squad', 'player stats', 'head-to-head', 'home and away record', 'injuries'], leagueFill: ['form', 'top scorers', 'head-to-head', 'latest results', 'every team'],
    wdl: { W: 'W', D: 'D', L: 'L' },
    prediction: 'prediction', previewTitle: 'prediction & preview', predictions: 'predictions', tableStats: 'table and stats', nextAndForm: 'next games, results and form',
    today: 'Football predictions today', todayBb: 'Basketball predictions today'
  },
  es: {
    form: 'forma', lastMeeting: 'último duelo', absences: 'bajas clave', table: 'en la tabla', record: 'balance', thisWeek: 'partidos esta semana', leader: 'líder', next: 'próximo',
    fbTails: ['Previa gratis y nuestro pronóstico de doble oportunidad.', 'Previa gratis y nuestro pronóstico.', 'Previa gratis.'],
    bbTails: ['Previa gratis, hándicap y nuestro pronóstico.', 'Previa gratis y nuestro pronóstico.', 'Previa gratis.'],
    teamTails: ['Calendario, resultados, forma y pronósticos.', 'Calendario, resultados y pronósticos.', 'Pronósticos.'],
    leagueTails: ['Clasificación, calendario y pronósticos de cada partido.', 'Clasificación y pronósticos.', 'Pronósticos.'],
    fbFill: ['cara a cara', 'goles esperados', 'alineaciones', 'descanso', 'clasificación', 'noticias del equipo'], bbFill: ['cara a cara', 'descanso', 'jugadores clave', 'puntos totales', 'local y visitante', 'últimos resultados'],
    teamFill: ['plantilla', 'estadísticas', 'cara a cara', 'local y visitante', 'lesiones'], leagueFill: ['forma', 'goleadores', 'cara a cara', 'últimos resultados', 'todos los equipos'],
    wdl: { W: 'G', D: 'E', L: 'P' },
    prediction: 'pronóstico', previewTitle: 'pronóstico y previa', predictions: 'pronósticos', tableStats: 'clasificación y estadísticas', nextAndForm: 'próximos partidos, resultados y forma',
    today: 'Pronósticos de fútbol para hoy', todayBb: 'Pronósticos de baloncesto para hoy'
  },
  pt: {
    form: 'forma', lastMeeting: 'último confronto', absences: 'desfalques', table: 'na tabela', record: 'campanha', thisWeek: 'jogos esta semana', leader: 'líder', next: 'próximo',
    fbTails: ['Antevisão grátis e o nosso palpite de dupla hipótese.', 'Antevisão grátis e o nosso palpite.', 'Antevisão grátis.'],
    bbTails: ['Antevisão grátis, handicap e o nosso palpite.', 'Antevisão grátis e o nosso palpite.', 'Antevisão grátis.'],
    teamTails: ['Calendário, resultados, forma e palpites.', 'Calendário, resultados e palpites.', 'Palpites.'],
    leagueTails: ['Classificação, calendário e palpites para cada jogo.', 'Classificação e palpites.', 'Palpites.'],
    fbFill: ['confronto direto', 'golos esperados', 'escalações', 'descanso', 'classificação', 'notícias das equipas'], bbFill: ['confronto direto', 'descanso', 'jogadores-chave', 'pontos totais', 'casa e fora', 'últimos resultados'],
    teamFill: ['plantel', 'estatísticas', 'confronto direto', 'casa e fora', 'lesões'], leagueFill: ['forma', 'marcadores', 'confronto direto', 'últimos resultados', 'todas as equipas'],
    wdl: { W: 'V', D: 'E', L: 'D' },
    prediction: 'palpite', previewTitle: 'palpite e antevisão', predictions: 'palpites', tableStats: 'classificação e estatísticas', nextAndForm: 'próximos jogos, resultados e forma',
    today: 'Palpites de futebol para hoje', todayBb: 'Palpites de basquetebol para hoje'
  },
  de: {
    form: 'Form', lastMeeting: 'letztes Duell', absences: 'wichtige Ausfälle', table: 'in der Tabelle', record: 'Bilanz', thisWeek: 'Spiele diese Woche', leader: 'Spitzenreiter', next: 'nächstes Spiel',
    fbTails: ['Kostenlose Vorschau und unser Doppelte-Chance-Tipp.', 'Kostenlose Vorschau und unser Tipp.', 'Kostenlose Vorschau.'],
    bbTails: ['Kostenlose Vorschau, Spread und unser Tipp.', 'Kostenlose Vorschau und unser Tipp.', 'Kostenlose Vorschau.'],
    teamTails: ['Spielplan, Ergebnisse, Form und unsere Prognosen.', 'Spielplan, Ergebnisse und Prognosen.', 'Prognosen.'],
    leagueTails: ['Tabelle, Spielplan und Prognosen für jedes Spiel.', 'Tabelle und Prognosen.', 'Prognosen.'],
    fbFill: ['direkter Vergleich', 'erwartete Tore', 'Aufstellungen', 'Pausentage', 'Tabelle', 'Teamnews'], bbFill: ['direkter Vergleich', 'Pausentage', 'Schlüsselspieler', 'Gesamtpunkte', 'Heim- und Auswärtsbilanz', 'letzte Ergebnisse'],
    teamFill: ['Kader', 'Spielerstatistiken', 'direkter Vergleich', 'Heim- und Auswärtsbilanz', 'Verletzungen'], leagueFill: ['Form', 'Torschützen', 'direkter Vergleich', 'letzte Ergebnisse', 'alle Teams'],
    wdl: { W: 'S', D: 'U', L: 'N' },
    prediction: 'Prognose', previewTitle: 'Prognose & Vorschau', predictions: 'Prognosen', tableStats: 'Tabelle und Statistiken', nextAndForm: 'nächste Spiele, Ergebnisse und Form',
    today: 'Fußball-Prognosen für heute', todayBb: 'Basketball-Prognosen für heute'
  },
  fr: {
    form: 'forme', lastMeeting: 'dernier duel', absences: 'absences clés', table: 'au classement', record: 'bilans', thisWeek: 'matchs cette semaine', leader: 'leader', next: 'prochain match',
    fbTails: ['Avant-match gratuit et notre pronostic double chance.', 'Avant-match gratuit et notre pronostic.', 'Avant-match gratuit.'],
    bbTails: ['Avant-match gratuit, handicap et notre pronostic.', 'Avant-match gratuit et notre pronostic.', 'Avant-match gratuit.'],
    teamTails: ['Calendrier, résultats, forme et pronostics.', 'Calendrier, résultats et pronostics.', 'Pronostics.'],
    leagueTails: ['Classement, calendrier et pronostics de chaque match.', 'Classement et pronostics.', 'Pronostics.'],
    fbFill: ['face-à-face', 'buts attendus', 'compositions', 'jours de repos', 'classement', 'infos des équipes'], bbFill: ['face-à-face', 'jours de repos', 'joueurs clés', 'total de points', 'domicile et extérieur', 'derniers résultats'],
    teamFill: ['effectif', 'statistiques', 'face-à-face', 'domicile et extérieur', 'blessures'], leagueFill: ['forme', 'buteurs', 'face-à-face', 'derniers résultats', 'toutes les équipes'],
    wdl: { W: 'V', D: 'N', L: 'D' },
    prediction: 'pronostic', previewTitle: 'pronostic et avant-match', predictions: 'pronostics', tableStats: 'classement et statistiques', nextAndForm: 'prochains matchs, résultats et forme',
    today: 'Pronostics foot du jour', todayBb: 'Pronostics basket du jour'
  },
  it: {
    form: 'forma', lastMeeting: 'ultimo scontro', absences: 'assenze chiave', table: 'in classifica', record: 'bilancio', thisWeek: 'partite questa settimana', leader: 'capolista', next: 'prossima',
    fbTails: ['Anteprima gratuita e il nostro pronostico doppia chance.', 'Anteprima gratuita e il nostro pronostico.', 'Anteprima gratuita.'],
    bbTails: ['Anteprima gratuita, handicap e il nostro pronostico.', 'Anteprima gratuita e il nostro pronostico.', 'Anteprima gratuita.'],
    teamTails: ['Calendario, risultati, forma e pronostici.', 'Calendario, risultati e pronostici.', 'Pronostici.'],
    leagueTails: ['Classifica, calendario e pronostici per ogni partita.', 'Classifica e pronostici.', 'Pronostici.'],
    fbFill: ['precedenti', 'gol attesi', 'formazioni', 'giorni di riposo', 'classifica', 'notizie sulle squadre'], bbFill: ['precedenti', 'giorni di riposo', 'giocatori chiave', 'punti totali', 'casa e trasferta', 'ultimi risultati'],
    teamFill: ['rosa', 'statistiche', 'precedenti', 'casa e trasferta', 'infortuni'], leagueFill: ['forma', 'marcatori', 'precedenti', 'ultimi risultati', 'tutte le squadre'],
    wdl: { W: 'V', D: 'P', L: 'S' },
    prediction: 'pronostico', previewTitle: 'pronostico e anteprima', predictions: 'pronostici', tableStats: 'classifica e statistiche', nextAndForm: 'prossime partite, risultati e forma',
    today: 'Pronostici calcio di oggi', todayBb: 'Pronostici basket di oggi'
  },
  tr: {
    form: 'form', lastMeeting: 'son maç', absences: 'önemli eksikler', table: 'puan durumunda', record: 'derece', thisWeek: 'bu haftaki maçlar', leader: 'lider', next: 'sıradaki maç',
    fbTails: ['Ücretsiz önizleme ve çifte şans tahminimiz.', 'Ücretsiz önizleme ve tahminimiz.', 'Ücretsiz önizleme.'],
    bbTails: ['Ücretsiz önizleme, handikap ve tahminimiz.', 'Ücretsiz önizleme ve tahminimiz.', 'Ücretsiz önizleme.'],
    teamTails: ['Fikstür, sonuçlar, form ve tahminlerimiz.', 'Fikstür, sonuçlar ve tahminler.', 'Tahminler.'],
    leagueTails: ['Puan durumu, fikstür ve her maç için tahminler.', 'Puan durumu ve tahminler.', 'Tahminler.'],
    fbFill: ['karşılaşma geçmişi', 'beklenen goller', 'kadrolar', 'dinlenme günleri', 'puan durumu', 'takım haberleri'], bbFill: ['karşılaşma geçmişi', 'dinlenme günleri', 'kilit oyuncular', 'toplam sayı', 'iç saha ve deplasman', 'son sonuçlar'],
    teamFill: ['kadro', 'oyuncu istatistikleri', 'karşılaşma geçmişi', 'iç saha ve deplasman', 'sakatlıklar'], leagueFill: ['form', 'gol krallığı', 'karşılaşma geçmişi', 'son sonuçlar', 'tüm takımlar'],
    wdl: { W: 'G', D: 'B', L: 'M' },
    prediction: 'tahmin', previewTitle: 'tahmin ve önizleme', predictions: 'tahminleri', tableStats: 'puan durumu ve istatistikler', nextAndForm: 'sonraki maçlar, sonuçlar ve form',
    today: 'Bugünün futbol tahminleri', todayBb: 'Bugünün basketbol tahminleri'
  }
};
export const pack = (l: Lang) => P[l];
export const shortDate = (iso: string, l: Lang) => new Date(iso).toLocaleDateString(LOCALE[l], { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
export const titleDate = (iso: string, l: Lang) => new Date(iso).toLocaleDateString(LOCALE[l], { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
export const formLetters = (seq: ('W' | 'D' | 'L')[], l: Lang) => seq.map(x => P[l].wdl[x]).join(' ');

/**
 * "lead: clause, clause. tail" — clauses (in order of importance) and then fillers go in while the sentence stays
 * ≤ max; the longest tail that still fits is used. Aims for min..max; never cuts a word.
 */
export function fitDescription(leads: string[], clauses: string[], fillers: string[], tails: string[], min = 140, max = 155): string {
  const build = (lead: string, cs: string[], tail: string) => `${lead}${cs.length ? `: ${cs.join(', ')}` : ''}. ${tail}`;
  const shortest = tails[tails.length - 1];
  for (const lead of leads) {
    if (build(lead, [], shortest).length > max) continue;
    const chosen: string[] = [];
    for (const c of clauses) if (build(lead, [...chosen, c], shortest).length <= max) chosen.push(c);
    const tailFor = (cs: string[]) => tails.find(t => build(lead, cs, t).length <= max) || shortest;
    for (const f of fillers) {
      if (build(lead, chosen, tailFor(chosen)).length >= min) break;
      if (build(lead, [...chosen, f], shortest).length <= max) chosen.push(f);
    }
    // the longest tail that fits; when that leaves it short, a filler with a shorter tail may still reach min
    return build(lead, chosen, tailFor(chosen));
  }
  return build(leads[leads.length - 1], [], shortest);
}

/** Fixed pages: one description per language (each a full sentence, no "…"). */
export const STATIC: Record<string, Record<Lang, string>> = {
  home: {
    en: 'Sports predictions tested in public: football leagues, cups and national teams, plus basketball. Form, head-to-head and our double-chance pick every match.',
    es: 'Pronósticos deportivos verificados en público: ligas, copas y selecciones de fútbol, y baloncesto. Forma, cara a cara y doble oportunidad en cada partido.',
    pt: 'Palpites desportivos verificados em público: ligas, taças e seleções de futebol, mais basquetebol. Forma, confronto direto e dupla hipótese em cada jogo.',
    de: 'Sportprognosen, öffentlich geprüft: Fußball-Ligen, Pokale und Nationalteams, dazu Basketball. Form, direkter Vergleich und Doppelte Chance für jedes Spiel.',
    fr: 'Pronostics sportifs vérifiés en public : championnats, coupes et sélections de foot, plus le basket. Forme, face-à-face et double chance pour chaque match.',
    it: 'Pronostici sportivi verificati in pubblico: campionati, coppe e nazionali di calcio, più il basket. Forma, precedenti e doppia chance per ogni partita.',
    tr: 'Herkese açık test edilen spor tahminleri: futbol ligleri, kupalar ve milli takımlar, ayrıca basketbol. Her maç için form, karşılaşma geçmişi ve çifte şans.'
  },
  matches: {
    en: 'Today’s and upcoming football matches with free previews: form, head-to-head, table and our double-chance pick for top leagues, cups and national teams.',
    es: 'Partidos de fútbol de hoy y próximos con previas gratis: forma, cara a cara y clasificación, más nuestra doble oportunidad en ligas, copas y selecciones.',
    pt: 'Jogos de futebol de hoje e próximos com antevisões grátis: forma, confronto direto e tabela, mais a nossa dupla hipótese em ligas, taças e seleções.',
    de: 'Heutige und kommende Fußballspiele mit kostenloser Vorschau: Form, direkter Vergleich und Tabelle, dazu unser Doppelte-Chance-Tipp für Ligen und Pokale.',
    fr: 'Matchs de foot du jour et à venir avec avant-match gratuit : forme, face-à-face et classement, et notre double chance pour ligues, coupes et sélections.',
    it: 'Partite di calcio di oggi e in arrivo con anteprima gratuita: forma, precedenti e classifica, e la nostra doppia chance per campionati, coppe e nazionali.',
    tr: 'Bugünün ve yaklaşan futbol maçları ücretsiz önizlemeyle: form, karşılaşma geçmişi ve puan durumu, ayrıca ligler, kupalar ve milli takımlar için çifte şans.'
  },
  basketball: {
    en: 'Basketball predictions for the NBA, EuroLeague, EuroCup and top national leagues: free previews, form, rest days and head-to-head, saved before tip-off.',
    es: 'Pronósticos de baloncesto para la NBA, EuroLiga, EuroCup y las mejores ligas: previas gratis, forma, descanso y cara a cara, guardados antes del partido.',
    pt: 'Palpites de basquetebol para a NBA, EuroLiga, EuroCup e as melhores ligas: antevisões grátis, forma, descanso e confronto direto, guardados antes do jogo.',
    de: 'Basketball-Prognosen für NBA, EuroLeague, EuroCup und die besten Ligen: kostenlose Vorschau, Form, Pausentage und direkter Vergleich, vorab gespeichert.',
    fr: 'Pronostics basket pour la NBA, l’EuroLigue, l’EuroCoupe et les grands championnats : avant-match gratuit, forme, repos et face-à-face, publiés avant.',
    it: 'Pronostici basket per NBA, EuroLega, EuroCup e i migliori campionati: anteprima gratuita, forma, riposo e precedenti, salvati prima della palla a due.',
    tr: 'NBA, EuroLeague, EuroCup ve önde gelen ligler için basketbol tahminleri: ücretsiz önizleme, form, dinlenme ve karşılaşma geçmişi, maç öncesi kaydedilir.'
  },
  today: {
    en: 'Football predictions today: every match of the day by league, with a short preview of form and head-to-head and our double-chance pick. Updated every day.',
    es: 'Pronósticos de fútbol para hoy: todos los partidos del día por liga, con una previa breve de forma y cara a cara y nuestra doble oportunidad. Cada día.',
    pt: 'Palpites de futebol para hoje: todos os jogos do dia por liga, com uma antevisão curta de forma e confronto direto e a nossa dupla hipótese. Todos os dias.',
    de: 'Fußball-Prognosen für heute: alle Spiele des Tages nach Liga, mit kurzer Vorschau zu Form und direktem Vergleich und unserem Doppelte-Chance-Tipp.',
    fr: 'Pronostics foot du jour : tous les matchs du jour par championnat, avec un aperçu de la forme et du face-à-face et notre double chance. Chaque jour.',
    it: 'Pronostici calcio di oggi: tutte le partite del giorno per campionato, con una breve anteprima di forma e precedenti e la nostra doppia chance.',
    tr: 'Bugünün futbol tahminleri: günün tüm maçları lige göre, form ve karşılaşma geçmişinin kısa önizlemesi ve çifte şans tahminimizle. Her gün güncellenir.'
  },
  todayBb: {
    en: 'Basketball predictions today: every game of the day by league, with a one-line preview of records, form and head-to-head, and our pick. Updated every day.',
    es: 'Pronósticos de baloncesto para hoy: todos los partidos del día por liga, con una previa breve de balance, forma y cara a cara, y nuestro pronóstico.',
    pt: 'Palpites de basquetebol para hoje: todos os jogos do dia por liga, com uma antevisão curta de campanha, forma e confronto direto, e o nosso palpite.',
    de: 'Basketball-Prognosen für heute: alle Spiele des Tages nach Liga, mit kurzer Vorschau zu Bilanz, Form und direktem Vergleich und unserem Tipp.',
    fr: 'Pronostics basket du jour : tous les matchs du jour par championnat, avec un aperçu des bilans, de la forme et du face-à-face, et notre pronostic.',
    it: 'Pronostici basket di oggi: tutte le partite del giorno per campionato, con una breve anteprima di bilancio, forma e precedenti, e il nostro pronostico.',
    tr: 'Bugünün basketbol tahminleri: günün tüm maçları lige göre, derece, form ve karşılaşma geçmişinin kısa önizlemesi ve tahminimizle. Her gün güncellenir.'
  },
  premium: {
    en: 'SportLikely Premium and Pro: full win, draw and loss chances, goals markets, team analysis, draw picks and upset watch for every match we cover.',
    es: 'SportLikely Premium y Pro: probabilidades completas de victoria, empate y derrota, mercados de goles, análisis de equipos y alertas de empate.',
    pt: 'SportLikely Premium e Pro: probabilidades completas de vitória, empate e derrota, mercados de golos, análise de equipas e alertas de empate.',
    de: 'SportLikely Premium und Pro: volle Sieg-, Remis- und Niederlagen-Chancen, Tormärkte, Teamanalyse, Remis-Tipps und Überraschungs-Alarm für jedes Spiel.',
    fr: 'SportLikely Premium et Pro : chances complètes de victoire, nul et défaite, marchés de buts, analyse des équipes, alertes nul et surprises par match.',
    it: 'SportLikely Premium e Pro: probabilità complete di vittoria, pareggio e sconfitta, mercati gol, analisi delle squadre, pareggi e sorprese ogni gara.',
    tr: 'SportLikely Premium ve Pro: tam galibiyet, beraberlik ve mağlubiyet olasılıkları, gol pazarları, takım analizi, beraberlik ve sürpriz uyarıları.'
  },
  generic: {
    en: 'Sports predictions tested in public: football now, basketball and more sports coming. Free previews and our double-chance pick for every match.',
    es: 'Pronósticos deportivos verificados en público: fútbol hoy, baloncesto y más deportes pronto. Previas gratis y doble oportunidad en cada partido.',
    pt: 'Palpites desportivos verificados em público: futebol agora, basquetebol e mais desportos em breve. Antevisões grátis e dupla hipótese em cada jogo.',
    de: 'Sportprognosen, öffentlich geprüft: jetzt Fußball, bald Basketball und mehr. Kostenlose Vorschau und unser Doppelte-Chance-Tipp für jedes Spiel.',
    fr: 'Pronostics sportifs vérifiés en public : le foot aujourd’hui, le basket et d’autres sports bientôt. Avant-match gratuit et double chance par match.',
    it: 'Pronostici sportivi verificati in pubblico: calcio ora, basket e altri sport in arrivo. Anteprima gratuita e doppia chance per ogni partita.',
    tr: 'Herkese açık test edilen spor tahminleri: şimdi futbol, yakında basketbol ve daha fazlası. Her maç için ücretsiz önizleme ve çifte şans tahminimiz.'
  }
};

/** Headings and labels of the crawler HTML in the page's language (fix124). */
type UiKey = 'matches' | 'today' | 'basketball' | 'recentForm' | 'lastMeetings' | 'lastResults' | 'nextGames' | 'table' | 'standings' | 'thisWeek'
  | 'absences' | 'team' | 'last' | 'season' | 'matchPreview' | 'gamePreview' | 'competitions' | 'leagues';
const UI: Record<Lang, Record<UiKey, string>> = {
  en: { matches: 'Football matches', today: 'Today', basketball: 'Basketball', recentForm: 'Recent form', lastMeetings: 'Last meetings', lastResults: 'Last results', nextGames: 'Next games', table: 'Table', standings: 'Standings', thisWeek: 'This week', absences: 'Absences', team: 'Team', last: 'last', season: 'Season', matchPreview: 'Match preview', gamePreview: 'Game preview', competitions: 'Competitions', leagues: 'Leagues' },
  es: { matches: 'Partidos de fútbol', today: 'Hoy', basketball: 'Baloncesto', recentForm: 'Forma reciente', lastMeetings: 'Últimos duelos', lastResults: 'Últimos resultados', nextGames: 'Próximos partidos', table: 'Clasificación', standings: 'Clasificación', thisWeek: 'Esta semana', absences: 'Bajas', team: 'Equipo', last: 'últimos', season: 'Temporada', matchPreview: 'Previa', gamePreview: 'Previa', competitions: 'Competiciones', leagues: 'Ligas' },
  pt: { matches: 'Jogos de futebol', today: 'Hoje', basketball: 'Basquetebol', recentForm: 'Forma recente', lastMeetings: 'Últimos confrontos', lastResults: 'Últimos resultados', nextGames: 'Próximos jogos', table: 'Classificação', standings: 'Classificação', thisWeek: 'Esta semana', absences: 'Ausências', team: 'Equipa', last: 'últimos', season: 'Época', matchPreview: 'Antevisão', gamePreview: 'Antevisão', competitions: 'Competições', leagues: 'Ligas' },
  de: { matches: 'Fußballspiele', today: 'Heute', basketball: 'Basketball', recentForm: 'Aktuelle Form', lastMeetings: 'Letzte Duelle', lastResults: 'Letzte Ergebnisse', nextGames: 'Nächste Spiele', table: 'Tabelle', standings: 'Tabelle', thisWeek: 'Diese Woche', absences: 'Ausfälle', team: 'Team', last: 'letzte', season: 'Saison', matchPreview: 'Vorschau', gamePreview: 'Vorschau', competitions: 'Wettbewerbe', leagues: 'Ligen' },
  fr: { matches: 'Matchs de foot', today: 'Aujourd’hui', basketball: 'Basket', recentForm: 'Forme récente', lastMeetings: 'Dernières confrontations', lastResults: 'Derniers résultats', nextGames: 'Prochains matchs', table: 'Classement', standings: 'Classement', thisWeek: 'Cette semaine', absences: 'Absents', team: 'Équipe', last: 'derniers', season: 'Saison', matchPreview: 'Avant-match', gamePreview: 'Avant-match', competitions: 'Compétitions', leagues: 'Championnats' },
  it: { matches: 'Partite di calcio', today: 'Oggi', basketball: 'Basket', recentForm: 'Forma recente', lastMeetings: 'Ultimi precedenti', lastResults: 'Ultimi risultati', nextGames: 'Prossime partite', table: 'Classifica', standings: 'Classifica', thisWeek: 'Questa settimana', absences: 'Assenti', team: 'Squadra', last: 'ultime', season: 'Stagione', matchPreview: 'Anteprima', gamePreview: 'Anteprima', competitions: 'Competizioni', leagues: 'Campionati' },
  tr: { matches: 'Futbol maçları', today: 'Bugün', basketball: 'Basketbol', recentForm: 'Son form', lastMeetings: 'Son karşılaşmalar', lastResults: 'Son sonuçlar', nextGames: 'Sonraki maçlar', table: 'Puan durumu', standings: 'Puan durumu', thisWeek: 'Bu hafta', absences: 'Eksikler', team: 'Takım', last: 'son', season: 'Sezon', matchPreview: 'Önizleme', gamePreview: 'Önizleme', competitions: 'Turnuvalar', leagues: 'Ligler' }
};
export const ui = (l: Lang, k: UiKey) => UI[l][k];
/** Long date in the page's language ("15 October 2026", "15 de octubre de 2026"). */
export const longDate = (iso: string, l: Lang) => new Date(iso).toLocaleDateString(LOCALE[l], { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
