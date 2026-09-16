import * as React from 'react';
import {
  Box,
  Button,
  Divider,
  Link as MuiLink,
  Typography,
} from '@mui/material';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import DownloadIcon from '@mui/icons-material/Download';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { getTranslations } from 'next-intl/server';
import {
  type ErrorRow,
  type ValidationErrorsModel,
  humanizeNoticeCode,
  parseInlineCode,
} from '../lib/validation-notices';
import { getValidatorRuleUrl } from '../lib/validator-rules';
import { formatDateShort } from '../../../utils/date';

type Translate = Awaited<ReturnType<typeof getTranslations<'feeds'>>>;

export interface ValidationErrorsPanelProps {
  model: ValidationErrorsModel;
  /** Built on the server, which has the environment's files host. */
  downloadUrl?: string;
}

/**
 * The validation errors of the dataset on show, each marked when it is new
 * rather than carried from an earlier dataset.
 */
export default async function ValidationErrorsPanel({
  model,
  downloadUrl,
}: ValidationErrorsPanelProps): Promise<React.ReactElement | null> {
  const t = await getTranslations('feeds');
  // Kept for a passing criterion too: the dataset and its report are still
  // worth reaching, and the section would otherwise be empty.
  if (model.datasetId == undefined) return null;

  const hasErrors = model.totalCount > 0;
  const headingKey =
    model.validatedAt == undefined
      ? hasErrors
        ? 'sealComplianceErrorsCurrent'
        : 'sealComplianceValidated'
      : hasErrors
        ? 'sealComplianceErrorsAsOf'
        : 'sealComplianceValidatedOn';

  return (
    <Box sx={{ mt: 3 }} data-testid='validation-errors-panel'>
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          rowGap: 1.5,
          columnGap: 2,
          pb: hasErrors ? 1.5 : 0,
          ...(hasErrors && {
            borderBottom: '1px solid',
            borderColor: 'divider',
          }),
        }}
      >
        <Typography component='h4' variant='subtitle1' sx={{ fontWeight: 700 }}>
          {model.validatedAt != undefined
            ? t(headingKey, { date: formatDateShort(model.validatedAt) })
            : t(headingKey)}
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
          {downloadUrl != undefined && (
            <Button
              size='small'
              variant='outlined'
              href={downloadUrl}
              target='_blank'
              rel='noreferrer nofollow'
              startIcon={<DownloadIcon fontSize='small' />}
              data-testid='validation-errors-download'
            >
              {t('sealComplianceDownloadDataset')}
            </Button>
          )}
          {model.reportUrl != undefined && (
            <Button
              size='small'
              variant='text'
              href={model.reportUrl}
              target='_blank'
              rel='noreferrer'
              endIcon={<OpenInNewIcon fontSize='small' />}
            >
              {t('sealComplianceViewReportLink')}
            </Button>
          )}
        </Box>
      </Box>

      {hasErrors && (
        <>
          <ProvenanceLine model={model} t={t} />
          <Box sx={{ mt: 0.5 }}>
            {model.rows.map((row, index) => (
              <React.Fragment key={row.code}>
                {index > 0 && <Divider />}
                <ErrorListRow row={row} t={t} />
              </React.Fragment>
            ))}
          </Box>
          {model.totalCount > model.rows.length && (
            <Typography
              variant='caption'
              component='p'
              color='text.secondary'
              sx={{ mt: 1.5 }}
              data-testid='validation-errors-truncated'
            >
              {t.rich('sealComplianceTruncated', {
                shown: model.rows.length,
                total: model.totalCount,
                // Inline so the report is one click from the sentence that
                // sends you there, rather than back up at the header.
                link: (chunks) =>
                  model.reportUrl != undefined ? (
                    <MuiLink
                      href={model.reportUrl}
                      target='_blank'
                      rel='noreferrer'
                      sx={{ fontSize: 'inherit' }}
                    >
                      {chunks}
                    </MuiLink>
                  ) : (
                    <>{chunks}</>
                  ),
              })}
            </Typography>
          )}
        </>
      )}
    </Box>
  );
}

/** Says once what would otherwise repeat on every row. */
function ProvenanceLine({
  model,
  t,
}: {
  model: ValidationErrorsModel;
  t: Translate;
}): React.ReactElement | null {
  const parts: string[] = [];
  if (model.carriedCount > 0) {
    parts.push(
      t('sealComplianceCarriedSummary', { count: model.carriedCount }),
    );
  }
  if (model.newCount > 0) {
    parts.push(t('sealComplianceNewSummary', { count: model.newCount }));
  }
  if (parts.length === 0) return null;

  return (
    <Typography
      variant='body2'
      color='text.secondary'
      sx={{ mt: 1.5 }}
      data-testid='validation-errors-provenance'
    >
      {parts.join(' ')}
    </Typography>
  );
}

function ErrorListRow({
  row,
  t,
}: {
  row: ErrorRow;
  t: Translate;
}): React.ReactElement {
  return (
    <Box
      sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, py: 1.75 }}
      data-testid={`validation-error-${row.code}`}
    >
      <ErrorOutlineIcon
        fontSize='small'
        aria-hidden
        sx={{
          color: 'error.main',
          flexShrink: 0,
          alignSelf: 'flex-start',
          mt: '1px',
        }}
      />
      <Box sx={{ minWidth: 0, flexGrow: 1 }}>
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'baseline',
            gap: 1,
          }}
        >
          <MuiLink
            href={getValidatorRuleUrl(row.code)}
            target='_blank'
            rel='noreferrer'
            variant='body2'
            sx={{
              fontFamily: 'monospace',
              fontWeight: 700,
              overflowWrap: 'anywhere',
            }}
          >
            {row.code}
          </MuiLink>
          {row.files.length > 0 && (
            <Typography
              component='span'
              variant='caption'
              color='text.secondary'
              sx={{ fontFamily: 'monospace' }}
            >
              {row.files.join(', ')}
            </Typography>
          )}
          {row.isNew && (
            <Typography
              component='span'
              variant='caption'
              sx={{
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: 'error.main',
              }}
            >
              {t('sealComplianceNewBadge')}
            </Typography>
          )}
        </Box>
        <Typography variant='body2' color='text.secondary' sx={{ mt: 0.25 }}>
          {parseInlineCode(row.summary ?? humanizeNoticeCode(row.code)).map(
            (segment, index) =>
              segment.isCode ? (
                <Box
                  key={index}
                  component='code'
                  sx={{
                    fontFamily: 'monospace',
                    fontSize: '0.9em',
                    px: 0.5,
                    borderRadius: '3px',
                    backgroundColor: 'action.hover',
                  }}
                >
                  {segment.text}
                </Box>
              ) : (
                <React.Fragment key={index}>{segment.text}</React.Fragment>
              ),
          )}
        </Typography>
      </Box>
      <Typography
        variant='body2'
        sx={{
          flexShrink: 0,
          fontVariantNumeric: 'tabular-nums',
          color: 'text.secondary',
          whiteSpace: 'nowrap',
        }}
      >
        {t('sealComplianceOccurrences', { count: row.total })}
      </Typography>
    </Box>
  );
}
