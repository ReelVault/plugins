export interface Messages {
	discover: string;
	discoverKicker: string;
	myRequests: string;
	admin: string;
	adminKicker: string;
	searchPlaceholder: string;
	search: string;
	clear: string;
	noResults: string;
	loading: string;
	error: string;
	retry: string;
	recentRequests: string;
	trending: string;
	popularMovies: string;
	popularShows: string;
	upcomingMovies: string;
	upcomingShows: string;
	comingSoonKicker: string;
	comingSoonTitle: string;
	comingSoonSubtitle: string;
	topRatedMovies: string;
	topRatedShows: string;
	movieGenres: string;
	tvGenres: string;
	genres: string;
	loadMore: string;
	recommendations: string;
	similar: string;
	request: string;
	requesting: string;
	available: string;
	pending: string;
	approved: string;
	inProgress: string;
	markInProgress: string;
	markAvailable: string;
	rejected: string;
	none: string;
	season: string;
	seasonOne: string;
	seasonsCount: string;
	seasonsHeader: string;
	episodes: string;
	episodeCountOne: string;
	cast: string;
	overview: string;
	remove: string;
	confirmRemove: string;
	save: string;
	cancel: string;
	close: string;
	apply: string;
	status: string;
	type: string;
	title: string;
	created: string;
	requestedBy: string;
	total: string;
	movie: string;
	tvShow: string;
	all: string;
	back: string;
	openInLibrary: string;
	originalTitle: string;
	releaseDateLabel: string;
	firstAirDateLabel: string;
	production: string;
	requestSuccess: string;
	requestError: string;
	actionError: string;
	unsupported: string;
	noProvider: string;
	details: string;
	approve: string;
	reject: string;
	notes: string;
	notesPlaceholder: string;
	searchRequests: string;
	availabilityUnavailable: string;
	noRequests: string;
	manage: string;
}

const EN: Messages = {
	discover: "Requests",
	discoverKicker: "Media requests",
	myRequests: "My requests",
	admin: "Media requests",
	adminKicker: "Request management",
	searchPlaceholder: "Search movies and series",
	search: "Search",
	clear: "Clear",
	noResults: "No results",
	loading: "Loading…",
	error: "Something went wrong",
	retry: "Retry",
	recentRequests: "Recent requests",
	trending: "Trending",
	popularMovies: "Popular movies",
	popularShows: "Popular series",
	upcomingMovies: "Upcoming movies",
	upcomingShows: "Upcoming series",
	comingSoonKicker: "Requested",
	comingSoonTitle: "Coming soon",
	comingSoonSubtitle: "to your library.",
	topRatedMovies: "Top rated movies",
	topRatedShows: "Top rated series",
	movieGenres: "Movie genres",
	tvGenres: "Series genres",
	genres: "Genres",
	loadMore: "Load more",
	recommendations: "Recommendations",
	similar: "Similar",
	request: "Request",
	requesting: "Requesting…",
	available: "Available",
	pending: "Pending",
	approved: "Approved",
	inProgress: "In progress",
	markInProgress: "In progress",
	markAvailable: "Mark available",
	rejected: "Rejected",
	none: "Not available",
	season: "Season",
	seasonOne: "1 season",
	seasonsCount: "seasons",
	seasonsHeader: "Seasons",
	episodes: "episodes",
	episodeCountOne: "1 episode",
	cast: "Cast",
	overview: "Overview",
	remove: "Remove",
	confirmRemove: "Delete this request?",
	save: "Save",
	cancel: "Cancel",
	close: "Close",
	apply: "Apply filters",
	status: "Status",
	type: "Type",
	title: "Title",
	created: "Created",
	requestedBy: "Requested by",
	total: "Total",
	movie: "Movie",
	tvShow: "Series",
	all: "All",
	back: "Back",
	openInLibrary: "Open in library",
	originalTitle: "Original title",
	releaseDateLabel: "Release date",
	firstAirDateLabel: "First air date",
	production: "Production",
	requestSuccess: "Request submitted",
	requestError: "Could not submit the request",
	actionError: "Action failed",
	unsupported: "Discovery is unavailable — install a metadata provider (e.g. TMDB) that supports feeds.",
	noProvider: "No metadata provider is installed.",
	details: "Details",
	approve: "Approve",
	reject: "Reject",
	notes: "Notes",
	notesPlaceholder: "Add a note…",
	searchRequests: "Search by title or requester",
	availabilityUnavailable: "Availability unknown",
	noRequests: "No requests yet.",
	manage: "Manage",
};

const PL: Messages = {
	discover: "Prośby",
	discoverKicker: "System próśb",
	myRequests: "Moje prośby",
	admin: "Prośby o media",
	adminKicker: "Zarządzanie prośbami",
	searchPlaceholder: "Szukaj filmów i seriali",
	search: "Szukaj",
	clear: "Wyczyść",
	noResults: "Brak wyników",
	loading: "Ładowanie…",
	error: "Coś poszło nie tak",
	retry: "Spróbuj ponownie",
	recentRequests: "Ostatnie prośby",
	trending: "Popularne teraz",
	popularMovies: "Popularne filmy",
	popularShows: "Popularne seriale",
	upcomingMovies: "Nadchodzące filmy",
	upcomingShows: "Nadchodzące seriale",
	comingSoonKicker: "Zgłoszone",
	comingSoonTitle: "Wkrótce",
	comingSoonSubtitle: "w bibliotece.",
	topRatedMovies: "Najwyżej oceniane filmy",
	topRatedShows: "Najwyżej oceniane seriale",
	movieGenres: "Gatunki filmowe",
	tvGenres: "Gatunki seriali",
	genres: "Gatunki",
	loadMore: "Załaduj więcej",
	recommendations: "Rekomendacje",
	similar: "Podobne",
	request: "Poproś",
	requesting: "Wysyłanie…",
	available: "Dostępny",
	pending: "Oczekuje",
	approved: "Zatwierdzony",
	inProgress: "W trakcie",
	markInProgress: "W trakcie",
	markAvailable: "Oznacz jako dostępne",
	rejected: "Odrzucony",
	none: "Niedostępny",
	season: "Sezon",
	seasonOne: "1 sezon",
	seasonsCount: "sezony",
	seasonsHeader: "Sezony",
	episodes: "odcinków",
	episodeCountOne: "1 odcinek",
	cast: "Obsada",
	overview: "Przegląd",
	remove: "Usuń",
	confirmRemove: "Usunąć tę prośbę?",
	save: "Zapisz",
	cancel: "Anuluj",
	close: "Zamknij",
	apply: "Zastosuj filtry",
	status: "Stan",
	type: "Typ",
	title: "Tytuł",
	created: "Utworzono",
	requestedBy: "Zgłoszone przez",
	total: "Razem",
	movie: "Film",
	tvShow: "Serial",
	all: "Wszystkie",
	back: "Wróć",
	openInLibrary: "Otwórz w bibliotece",
	originalTitle: "Tytuł oryginalny",
	releaseDateLabel: "Premiera",
	firstAirDateLabel: "Pierwsza emisja",
	production: "Produkcja",
	requestSuccess: "Prośba wysłana",
	requestError: "Nie udało się wysłać prośby",
	actionError: "Operacja nie powiodła się",
	unsupported: "Odkrywanie niedostępne — zainstaluj dostawcę metadanych (np. TMDB) obsługującego kanały.",
	noProvider: "Nie zainstalowano żadnego dostawcy metadanych.",
	details: "Szczegóły",
	approve: "Zatwierdź",
	reject: "Odrzuć",
	notes: "Notatki",
	notesPlaceholder: "Dodaj notatkę…",
	searchRequests: "Szukaj po tytule lub zgłaszającym",
	availabilityUnavailable: "Dostępność nieznana",
	noRequests: "Brak próśb.",
	manage: "Zarządzaj",
};

export function getMessages(locale: string): Messages {
	return locale.toLowerCase().startsWith("pl") ? PL : EN;
}
