// Local-dev / standalone-build stand-in for the entrypoint-generated runtime
// config (see docker-entrypoint.sh). Empty collector URL => Faro init is
// skipped gracefully; see src/config.ts and src/faro.ts.
window.__SPYGLASS_CONFIG__ = {
  faroCollectorUrl: '',
  faroAppKey: '',
  appEnvironment: 'local',
  faultsEnabled: true,
};
