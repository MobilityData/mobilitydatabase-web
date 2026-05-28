'use client';

import * as React from 'react';
import { useTheme } from '@mui/material/styles';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  Link,
  Paper,
  Snackbar,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  ContentCopyOutlined,
  RefreshOutlined,
  VisibilityOffOutlined,
  VisibilityOutlined,
  WarningAmberOutlined,
} from '@mui/icons-material';
import { useSelector } from 'react-redux';
import {
  selectIsRefreshingAccessToken,
  selectIsTokenRefreshed,
  selectRefreshingAccessTokenError,
  selectUserProfile,
} from '../../../store/selectors';
import { useAppDispatch } from '../../../hooks';
import { requestRefreshAccessToken } from '../../../store/profile-reducer';
import {
  formatTokenExpiration,
  getTimeLeftForTokenExpiration,
} from '../../../utils/date';
import { useTranslations } from 'next-intl';
import {
  codeBlockContentSx,
  codeBlockSx,
  tokenActionButtonsSx,
  tokenDisplayElementSx,
} from '../Account.styles';
import { AccountSectionContainer } from '../AccountSectionContainer';

interface APIAccountState {
  showRefreshToken: boolean;
  showAccessToken: boolean;
  codeBlockTooltip: string;
  tokenExpired: boolean;
}

enum TokenTypes {
  Access = 'accessToken',
  Refresh = 'refreshToken',
}

export default function AccountApiAccess(): React.ReactElement {
  const t = useTranslations('account');
  const tCommon = useTranslations('common');
  const apiURL = 'https://api.mobilitydatabase.org/v1';
  const dispatch = useAppDispatch();
  const theme = useTheme();
  const user = useSelector(selectUserProfile);

  const texts = {
    accessTokenHidden: t('accessToken.hidden'),
    refreshTokenHidden: t('refreshToken.placeholder'),
    copyAccessToken: t('accessToken.copyToken'),
    copyAccessTokenToClipboard: t('accessToken.copyTokenToClipboard'),
    copyRefreshToken: t('refreshToken.copy'),
    copyRefreshTokenToClipboard: t('refreshToken.copyToClipboard'),
    copyToClipboard: tCommon('copyToClipboard'),
    copied: tCommon('copied'),
    tokenUnavailable: t('accessToken.unavailable'),
  };

  const refreshingAccessTokenError = useSelector(
    selectRefreshingAccessTokenError,
  );
  const isRefreshingAccessToken = useSelector(selectIsRefreshingAccessToken);
  const isAccessTokenRefreshed = useSelector(selectIsTokenRefreshed);

  const [accountState, setAccountState] = React.useState<APIAccountState>({
    showRefreshToken: false,
    showAccessToken: false,
    codeBlockTooltip: texts.copyToClipboard,
    tokenExpired: false,
  });
  const [refreshTokenSuccess, setRefreshTokenSuccess] =
    React.useState<boolean>(false);
  const [timeLeftForTokenExpiration, setTimeLeftForTokenExpiration] =
    React.useState<string>('');
  const [showAccessTokenCopiedTooltip, setShowAccessTokenCopiedTooltip] =
    React.useState(false);
  const [showAccessTokenSnackbar, setShowAccessTokenSnackbar] =
    React.useState(false);
  const [accessTokenCopyResult, setAccessTokenCopyResult] =
    React.useState<string>('');
  const [showRefreshTokenCopied, setShowRefreshTokenCopied] =
    React.useState(false);
  const [refreshTokenCopyResult, setRefreshTokenCopyResult] =
    React.useState<string>('');

  const showGenerateAccessTokenButton = React.useMemo(() => {
    return user?.accessToken == null;
  }, [user?.accessToken]);

  React.useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    const accessTokenExpirationTime = user?.accessTokenExpirationTime;
    if (accessTokenExpirationTime !== undefined) {
      interval = setInterval(() => {
        const expirationTime = getTimeLeftForTokenExpiration(
          accessTokenExpirationTime,
        );
        let formattedExpirationTime = '';
        if (!expirationTime.future) {
          clearInterval(interval as NodeJS.Timeout);
          setAccountState({ ...accountState, tokenExpired: true });
        } else {
          formattedExpirationTime = formatTokenExpiration(
            expirationTime.duration,
          );
        }
        setTimeLeftForTokenExpiration(formattedExpirationTime);
      }, 250);
    }
    return () => {
      if (interval !== null) {
        clearInterval(interval);
      }
    };
  }, [user?.accessTokenExpirationTime]);

  React.useEffect(() => {
    setShowAccessTokenSnackbar(refreshingAccessTokenError !== null);
  }, [refreshingAccessTokenError]);

  React.useEffect(() => {
    if (isAccessTokenRefreshed) {
      setRefreshTokenSuccess(true);
      setTimeout(() => {
        setRefreshTokenSuccess(false);
      }, 1000);
    }
  }, [isAccessTokenRefreshed]);

  const handleClickShowToken = React.useCallback(
    (tokenType: TokenTypes): void => {
      switch (tokenType) {
        case TokenTypes.Access:
          setAccountState({
            ...accountState,
            showAccessToken: !accountState.showAccessToken,
          });
          break;
        case TokenTypes.Refresh:
          setAccountState({
            ...accountState,
            showRefreshToken: !accountState.showRefreshToken,
          });
          break;
      }
    },
    [accountState],
  );

  const handleCopyTokenToClipboard = React.useCallback(
    (
      token: string,
      setResult: (result: string) => void,
      setShowTooltip: (showToolTip: boolean) => void,
    ): void => {
      navigator.clipboard
        .writeText(token)
        .then(() => {
          setResult(texts.copied);
        })
        .catch((error) => {
          setResult(`Could not copy text: ${error}`);
        })
        .finally(() => {
          setShowTooltip(true);
          setTimeout(() => {
            setShowTooltip(false);
          }, 1000);
        });
    },
    [],
  );

  const handleGenerateAccessToken = (): void => {
    setAccountState({ ...accountState, tokenExpired: false });
    dispatch(requestRefreshAccessToken());
  };

  const getCurlAccessTokenCommand = (): string => {
    const refreshToken =
      user?.refreshToken !== undefined
        ? user?.refreshToken
        : `[${t('refreshToken.yourToken')}]`;
    return `curl --location '${apiURL}/tokens' --header 'Content-Type: application/json' --data '{ "refresh_token": "${refreshToken}" }'`;
  };

  const getCurlApiTestCommand = (): string => {
    const accessToken =
      user?.accessToken !== undefined
        ? user?.accessToken
        : `[${t('accessToken.yourToken')}]`;
    return `curl --location '${apiURL}/metadata' --header 'Accept: application/json' --header 'Authorization: Bearer ${accessToken}'`;
  };

  const handleCopyCodeBlock = (codeBlock: string): void => {
    navigator.clipboard
      .writeText(codeBlock)
      .then(() => {
        setAccountState({ ...accountState, codeBlockTooltip: texts.copied });
        setTimeout(() => {
          setAccountState({
            ...accountState,
            codeBlockTooltip: texts.copyToClipboard,
          });
        }, 1000);
      })
      .catch((error) => {
        if (process.env.NODE_ENV === 'development') {
          // eslint-disable-next-line no-console
          console.log('Could not copy text: ', error);
        }
      });
  };

  const refreshAccessTokenButtonText = isRefreshingAccessToken
    ? t('accessToken.refreshing')
    : t('accessToken.refresh');

  return (
    <Box>
      <Snackbar
        open={showAccessTokenSnackbar}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        autoHideDuration={6000}
        onClose={() => {
          setShowAccessTokenSnackbar(false);
        }}
      >
        <Alert
          severity='error'
          onClose={() => {
            setShowAccessTokenSnackbar(false);
          }}
        >
          {refreshingAccessTokenError?.message ?? ''}
        </Alert>
      </Snackbar>
      <Snackbar
        open={refreshTokenSuccess}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        autoHideDuration={6000}
        onClose={() => {
          setRefreshTokenSuccess(false);
        }}
      >
        <Alert
          severity='success'
          onClose={() => {
            setRefreshTokenSuccess(false);
          }}
        >
          {t('accessToken.refreshSuccess')}
        </Alert>
      </Snackbar>

      <AccountSectionContainer title={t('refreshToken.title')}>
        <Typography sx={{ mb: 2 }}>{t('description')}</Typography>
        <Typography sx={{ mb: 2 }}>{t('refreshToken.description')}</Typography>
        <Box sx={tokenDisplayElementSx}>
          <Typography
            width={500}
            variant='body1'
            sx={{ wordBreak: 'break-all' }}
          >
            {showRefreshTokenCopied
              ? refreshTokenCopyResult
              : accountState.showRefreshToken
                ? user?.refreshToken !== undefined
                  ? user?.refreshToken
                  : texts.tokenUnavailable
                : texts.refreshTokenHidden}
          </Typography>
          <Box sx={tokenActionButtonsSx}>
            <Tooltip
              title={
                showRefreshTokenCopied
                  ? refreshTokenCopyResult
                  : texts.copyRefreshToken
              }
            >
              <span>
                <IconButton
                  color='primary'
                  aria-label={texts.copyRefreshTokenToClipboard}
                  edge='end'
                  disabled={user?.refreshToken === undefined}
                  onClick={() => {
                    if (user?.refreshToken != null) {
                      handleCopyTokenToClipboard(
                        user.refreshToken,
                        setRefreshTokenCopyResult,
                        setShowRefreshTokenCopied,
                      );
                    }
                  }}
                  sx={{ display: 'inline-block', verticalAlign: 'middle' }}
                >
                  <ContentCopyOutlined fontSize='small' />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title={t('refreshToken.toggleVisibility')}>
              <IconButton
                color='primary'
                aria-label={t('refreshToken.toggleVisibility')}
                onClick={() => {
                  handleClickShowToken(TokenTypes.Refresh);
                }}
                edge='end'
                sx={{ display: 'inline-block', verticalAlign: 'middle' }}
              >
                {accountState.showRefreshToken ? (
                  <VisibilityOffOutlined fontSize='small' />
                ) : (
                  <VisibilityOutlined fontSize='small' />
                )}
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      </AccountSectionContainer>

      <AccountSectionContainer title={t('accessToken.title')} sx={{ mt: 3 }}>
        <Typography sx={{ mb: 2 }}>
          {t('accessToken.description.pt1') + ' '}
          <Link
            href='https://mobilitydata.github.io/mobility-feed-api/SwaggerUI/index.html'
            color={'inherit'}
            target='_blank'
          >
            {t('accessToken.description.cta')}
          </Link>{' '}
          {t('accessToken.description.pt2')}
        </Typography>
        <Paper elevation={3} sx={codeBlockSx}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '10px',
            }}
          >
            <Box>
              <Typography variant='h6'>{t('accessToken.generate')}</Typography>
              <Typography>{t('accessToken.copy')}</Typography>
            </Box>
            <Tooltip title={accountState.codeBlockTooltip}>
              <IconButton
                color='inherit'
                aria-label={texts.copyAccessTokenToClipboard}
                edge='end'
                onClick={() => {
                  handleCopyCodeBlock(getCurlAccessTokenCommand());
                }}
                sx={{ display: 'inline-block', verticalAlign: 'middle' }}
              >
                <ContentCopyOutlined fontSize='small' />
              </IconButton>
            </Tooltip>
          </Box>
          <Typography sx={codeBlockContentSx}>
            <span style={{ ...theme.mixins.code.command }}>curl</span>{' '}
            --location &apos;{apiURL}/tokens&apos;
            <span style={{ color: theme.mixins.code?.contrastText }}>\</span>
            <br />
            <span style={{ color: theme.mixins.code?.contrastText }}>
              --header
            </span>{' '}
            &apos;Content-Type: application/json&apos;
            <span style={{ color: theme.mixins.code?.contrastText }}>\</span>
            <br />
            <span style={{ color: theme.mixins.code?.contrastText }}>
              --data &apos;&#123;
            </span>
            <span>
              {' '}
              &quot;refresh_token&quot;: &quot;[{t('refreshToken.yourToken')}
              ]&quot;
            </span>
            <span style={{ color: theme.mixins.code?.contrastText }}>
              {' '}
              &#125;&apos;
            </span>
          </Typography>
        </Paper>
      </AccountSectionContainer>

      <AccountSectionContainer
        title={t('accessToken.testing.title')}
        sx={{ mt: 3 }}
      >
        <Typography sx={{ mb: 2 }}>
          {t('accessToken.testing.description.pt1') + ' '}
          <Link
            href='https://mobilitydata.github.io/mobility-feed-api/SwaggerUI/index.html#/'
            target={'_blank'}
          >
            {t('accessToken.testing.description.cta')}
          </Link>
          {t('accessToken.testing.description.pt2')}
        </Typography>
        {showGenerateAccessTokenButton && (
          <Box sx={{ mb: 2 }}>
            <Button onClick={handleGenerateAccessToken} variant='contained'>
              {t('accessToken.generate')}
            </Button>
          </Box>
        )}
        {!showGenerateAccessTokenButton && (
          <Box sx={{ width: 'fit-content', p: 1, mb: 5 }}>
            <Box sx={tokenDisplayElementSx}>
              <Typography
                width={500}
                variant='body1'
                sx={{ wordBreak: 'break-all' }}
              >
                {accountState.showAccessToken
                  ? user?.accessToken !== undefined
                    ? user?.accessToken
                    : texts.tokenUnavailable
                  : texts.accessTokenHidden}
              </Typography>
              <Box sx={tokenActionButtonsSx}>
                <Tooltip title={refreshAccessTokenButtonText}>
                  <span>
                    <IconButton
                      color='primary'
                      aria-label={refreshAccessTokenButtonText}
                      edge='end'
                      sx={{ display: 'inline-block', verticalAlign: 'middle' }}
                      onClick={handleGenerateAccessToken}
                      disabled={isRefreshingAccessToken}
                    >
                      {isRefreshingAccessToken ? (
                        <CircularProgress size={14} />
                      ) : (
                        <RefreshOutlined
                          fontSize='small'
                          sx={{
                            display: 'inline-block',
                            verticalAlign: 'middle',
                          }}
                        />
                      )}
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip
                  title={
                    showAccessTokenCopiedTooltip
                      ? accessTokenCopyResult
                      : texts.copyAccessToken
                  }
                >
                  <span>
                    <IconButton
                      color='primary'
                      aria-label={texts.copyAccessTokenToClipboard}
                      edge='end'
                      disabled={user?.accessToken === undefined}
                      onClick={() => {
                        if (user?.accessToken != null) {
                          handleCopyTokenToClipboard(
                            user.accessToken,
                            setAccessTokenCopyResult,
                            setShowAccessTokenCopiedTooltip,
                          );
                        }
                      }}
                      sx={{ display: 'inline-block', verticalAlign: 'middle' }}
                    >
                      <ContentCopyOutlined
                        fontSize='small'
                        sx={{
                          display: 'inline-block',
                          verticalAlign: 'middle',
                        }}
                      />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title={t('accessToken.toggleVisibility')}>
                  <IconButton
                    color='primary'
                    aria-label={t('accessToken.toggleVisibility')}
                    edge='end'
                    onClick={() => {
                      handleClickShowToken(TokenTypes.Access);
                    }}
                    sx={{ display: 'inline-block', verticalAlign: 'middle' }}
                  >
                    {accountState.showAccessToken ? (
                      <VisibilityOffOutlined
                        fontSize='small'
                        sx={{
                          display: 'inline-block',
                          verticalAlign: 'middle',
                        }}
                      />
                    ) : (
                      <VisibilityOutlined
                        fontSize='small'
                        sx={{
                          display: 'inline-block',
                          verticalAlign: 'middle',
                        }}
                      />
                    )}
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>
            <Typography color='error' sx={{ mb: 2 }}>
              <WarningAmberOutlined style={{ verticalAlign: 'bottom' }} />
              {accountState.tokenExpired
                ? t('accessToken.expired')
                : t('accessToken.willExpireIn', {
                    timeLeftForTokenExpiration,
                  })}
              .
            </Typography>
          </Box>
        )}
        <Paper elevation={3} sx={codeBlockSx}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '10px',
            }}
          >
            <Box>
              <Typography variant='h6'>
                {t('accessToken.testing.api')}
              </Typography>
              <Typography>{t('accessToken.testing.copyCli')}</Typography>
            </Box>
            <Tooltip title={accountState.codeBlockTooltip}>
              <IconButton
                color='inherit'
                aria-label={texts.copyAccessTokenToClipboard}
                edge='end'
                onClick={() => {
                  handleCopyCodeBlock(getCurlApiTestCommand());
                }}
                sx={{ display: 'inline-block', verticalAlign: 'middle' }}
              >
                <ContentCopyOutlined fontSize='small' />
              </IconButton>
            </Tooltip>
          </Box>
          <Typography sx={codeBlockContentSx}>
            <span style={{ color: '#ff79c6', fontWeight: 'bold' }}>curl</span>{' '}
            --location &apos;{apiURL}/metadata&apos;
            <span style={{ color: theme.mixins.code?.contrastText }}>\</span>
            <br />
            <span style={{ color: theme.mixins.code?.contrastText }}>
              --header
            </span>{' '}
            &apos;Accept: application/json&apos;
            <span style={{ color: theme.mixins.code?.contrastText }}>\</span>
            <br />
            <span style={{ color: theme.mixins.code?.contrastText }}>
              --header{' '}
            </span>
            &apos;Authorization: Bearer [{t('accessToken.yourToken')}]&apos;
          </Typography>
        </Paper>
      </AccountSectionContainer>
    </Box>
  );
}
