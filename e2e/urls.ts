// Each environment mode gets its own (mocked) backend origin so tests can
// assert requests never cross modes. Nothing listens on these ports — the
// backend is faked per test with page.route (see mockBackend.ts).
export const API_URLS = {
  paper: "http://127.0.0.1:18081",
  testnet: "http://127.0.0.1:18082",
  mainnet: "http://127.0.0.1:18083",
};
