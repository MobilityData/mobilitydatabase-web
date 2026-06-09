// Re-export from the shared components location so the standalone /gtfs-viewer
// route continues to work while GtfsDataViewer can import it without a [locale] path.
export { default } from '../../../components/gtfs-viewer/GtfsViewerClient';
