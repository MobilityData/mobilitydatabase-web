import type { RawAction } from '../../lib/raw-diff-query';

/** The file diff panel's colours (GtfsDiffTool/components/GtfsDiffFileDiffPanel). */
export const RAW_COLORS = {
  added: '#2e7d32',
  deleted: '#d32f2f',
  modified: '#ed6c02',
  idOnly: '#757575',
  /** Row tints, as the file diff panel's added / deleted / modified rows. */
  rowBg: {
    added: 'rgba(46,125,50,.07)',
    deleted: 'rgba(211,47,47,.07)',
    modified: 'rgba(237,108,2,.07)',
    id_only: 'rgba(117,117,117,.06)',
    unchanged: 'transparent',
  } satisfies Record<RawAction, string>,
};
