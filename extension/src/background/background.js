/**
 * Default config
 */
const API_URL = 'https://papertrailapp.com/api/v1';
const TOKEN_NAME = 'pt_personal_token';
const MAX_SUGGESTIONS = 10;

const headers = new Headers();
const parameters = {
  method: 'GET',
  headers,
  mode: 'cors',
  cache: 'default'
};

/**
 * Object contained cached suggestions
 */
let suggestionsCache = [];

/**
 * Filters a papertrail search result response to match Chrome suggestions object
 *
 * @param {Object} data
 * @returns
 */
function formatSearchAsSuggestion(data) {
  return {
    content: data._links.html_search.href,
    description: `[${data.group.name}] ${data.name} -`
  }
}

/**
 * Filters a papertrail systems search result response to match Chrome suggestions object
 *
 * @param {Object} data
 * @returns
 */
function formatSystemAsSuggestion(data) {
  return {
    content: data._links.html.href,
    description: `${data.name} -`
  }
}

/**
 * Navigates to given URL
 *
 * @param {string} url
 */
function navigate(url) {
  try {
    new URL(url);
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.update(tabs[0].id, { url: url });
    });
  } catch (e) { }
}

/*
 * Fetch searches after extension keyword is entered (once per session)
 */
chrome.omnibox.onInputStarted.addListener(
  () => {
    chrome.storage.sync.get({
      [TOKEN_NAME]: ''
    }, item => {
      if (item[TOKEN_NAME]) {
        parameters.headers.set('X-Papertrail-Token', item[TOKEN_NAME]);
        search();
      }
    });
  }
);

chrome.omnibox.onInputChanged.addListener(
  (text, suggest) => {
    chrome.storage.sync.get({
      [TOKEN_NAME]: ''
    }, async item => {
      if (suggestionsCache.length) {
        suggest(highlightResults(text, suggestionsCache));
      } else {
        if (item[TOKEN_NAME]) {
          parameters.headers.set('X-Papertrail-Token', item[TOKEN_NAME]);

          const data = await search();
          suggest(highlightResults(text, data));
        }
      }
    });
  }
);

/*
 * Redirects user to the selected suggestion URL
 */
chrome.omnibox.onInputEntered.addListener(
  (url, disposition) => {
    navigate(url);
  }
);

/**
 * Highlights matched text
 *
 * @param {string} text
 * @param {array} results
 * @returns
 */
function highlightResults(text, results) {
  const words = text.trim().split(' ').join('|');
  const searchTextRegExp = new RegExp(`(?:${words})`, 'gi');

  return results
    .filter(suggestion => {
      const matches = suggestion.description.match(searchTextRegExp);

      if (matches) {
        suggestion.matches = matches.length;
      }

      return !!matches;
    })
    .sort((a, b) => b.matches - a.matches) // Sort by number of matches
    .slice(0, MAX_SUGGESTIONS)
    .map(res => {
      const match = res.description.replace(searchTextRegExp, `<match>$&</match>`);
      return {
        content: res.content,
        description: `<dim>${match}</dim> <url>${res.content}</url>`
      }
    });
}

/**
 * Fetches Papertrail saved searches
 *
 * @param {any} params
 * @returns
 */
async function search() {
  try {
    const searchesResponse = await fetch(`${API_URL}/searches.json`, parameters);
    const systemsResponse = await fetch(`${API_URL}/systems.json`, parameters);

    const searchesData = await searchesResponse.json();
    const systemsData = await systemsResponse.json();

    suggestionsCache = searchesData.map(formatSearchAsSuggestion).concat(systemsData.map(formatSystemAsSuggestion));

    return suggestionsCache;
  }
  catch (e) {
    throw e;
  }
}
