'use client';

import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Box,
  Checkbox,
  Link as MuiLink,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
} from '@mui/material';
import NestedCheckboxList, {
  type CheckboxStructure,
} from '../../components/NestedCheckboxList';
import AccessRequiredPopover, {
  EARLY_ACCESS_REQUEST_FORM_URL,
} from '../../components/AccessRequiredPopover';
import { useTranslations } from 'next-intl';
import { useRemoteConfig } from '../../context/RemoteConfigProvider';
import { useSealOfReliabilityFilterAccess } from '../../hooks/useSealOfReliabilityFilterAccess';
import { Link } from '../../../i18n/navigation';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import LockIcon from '@mui/icons-material/Lock';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useEffect, useState } from 'react';
import { DATASET_FEATURES, groupFeaturesByComponent } from '../../utils/consts';
import { type GbfsVersionConfig } from '../../interface/RemoteConfig';
import { SearchHeader } from '../../styles/Filters.styles';

interface SealFilterRowProps {
  checked: boolean;
  disabled?: boolean;
  locked?: boolean;
  onClick?: (event: React.MouseEvent<HTMLElement>) => void;
}

function SealFilterRow({
  checked,
  disabled,
  locked,
  onClick,
}: SealFilterRowProps): React.ReactElement {
  return (
    <List sx={{ width: '100%' }} dense>
      <ListItem disablePadding>
        <ListItemButton
          disabled={disabled}
          dense
          sx={{ p: 0, display: 'flex', justifyContent: 'space-between' }}
          onClick={onClick}
        >
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Checkbox
              edge='start'
              tabIndex={-1}
              disableRipple
              checked={checked}
            />
            <ListItemText
              primary={<b>Seal of Reliability</b>}
              slotProps={{
                primary: {
                  variant: 'body1',
                  color: locked ? 'text.disabled' : undefined,
                },
              }}
            />
          </Box>
          {locked === true && (
            <LockIcon fontSize='small' sx={{ opacity: 0.6, mr: 1 }}></LockIcon>
          )}
        </ListItemButton>
      </ListItem>
    </List>
  );
}

function setInitialExpandGroup(): Record<string, boolean> {
  const expandGroup: Record<string, boolean> = {};
  Object.keys(
    groupFeaturesByComponent(Object.keys(DATASET_FEATURES), true),
  ).forEach((featureGroup) => {
    expandGroup[featureGroup] = false;
  });
  return expandGroup;
}

interface SearchFiltersProps {
  selectedFeedTypes: Record<string, boolean>;
  isOfficialFeedSearch: boolean;
  hasSealFeedSearch: boolean;
  selectedFeatures: string[];
  selectedGbfsVersions: string[];
  selectedLicenses: string[];
  selectedLicenseTags: string[];
  setSelectedFeedTypes: (selectedFeedTypes: Record<string, boolean>) => void;
  setIsOfficialFeedSearch: (isOfficialFeedSearch: boolean) => void;
  setHasSealFeedSearch: (hasSealFeedSearch: boolean) => void;
  setSelectedFeatures: (selectedFeatures: string[]) => void;
  setSelectedGbfsVerions: (selectedVersions: string[]) => void;
  setSelectedLicenses: (selectedLicenses: string[]) => void;
  setSelectedLicenseTags: (selectedLicenseTags: string[]) => void;
  isOfficialTagFilterEnabled: boolean;
  areFeatureFiltersEnabled: boolean;
  areGBFSFiltersEnabled: boolean;
}

const LICENSE_TAGS = [
  'family:CC',
  'family:ODC',
  'notes:attribution-required',
  'notes:share-alike',
  'license:public-domain',
  'license:government-open-license',
];

export function SearchFilters({
  selectedFeedTypes,
  isOfficialFeedSearch,
  hasSealFeedSearch,
  selectedFeatures,
  selectedGbfsVersions,
  selectedLicenses,
  selectedLicenseTags,
  setSelectedFeedTypes,
  setIsOfficialFeedSearch,
  setHasSealFeedSearch,
  setSelectedFeatures,
  setSelectedGbfsVerions,
  setSelectedLicenses,
  setSelectedLicenseTags,
  isOfficialTagFilterEnabled,
  areFeatureFiltersEnabled,
  areGBFSFiltersEnabled,
}: SearchFiltersProps): React.ReactElement {
  const t = useTranslations('feeds');
  const tCommon = useTranslations('common');
  const { config } = useRemoteConfig();
  const {
    isFeatureLive: isSealOfReliabilityLive,
    isPending: isSealAccessPending,
    hasNoAccess: hasNoSealAccess,
  } = useSealOfReliabilityFilterAccess();

  const [sealAccessPopoverAnchor, setSealAccessPopoverAnchor] =
    useState<HTMLElement | null>(null);

  const gbfsVersionsObject: GbfsVersionConfig = JSON.parse(config.gbfsVersions);

  const [expandedCategories, setExpandedCategories] = useState<
    Record<string, boolean>
  >({
    features: areFeatureFiltersEnabled,
    tags: isOfficialTagFilterEnabled,
    gbfsVersions: true,
    licenses: true,
    licenseTags: true,
  });
  const [featureCheckboxData, setFeatureCheckboxData] = useState<
    CheckboxStructure[]
  >([]);
  const [expandedElements, setExpandedElements] = useState<
    Record<string, boolean>
  >(setInitialExpandGroup());

  const dataTypesCheckboxData: CheckboxStructure[] = [
    {
      title: tCommon('gtfsSchedule'),
      checked: selectedFeedTypes.gtfs,
      type: 'checkbox',
    },
    {
      title: tCommon('gtfsRealtime'),
      checked: selectedFeedTypes.gtfs_rt,
      type: 'checkbox',
    },
    {
      title: tCommon('gbfs'),
      checked: selectedFeedTypes.gbfs,
      type: 'checkbox',
    },
  ];

  function generateCheckboxStructure(): CheckboxStructure[] {
    const groupedFeatures = groupFeaturesByComponent(
      Object.keys(DATASET_FEATURES),
      true,
    );
    return Object.entries(groupedFeatures)
      .filter(([parent]) => parent !== 'Other')
      .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
      .map(([parent, features]) => ({
        title: parent,
        checked: features.every((feature) =>
          selectedFeatures.includes(feature.feature),
        ),
        seeChildren: expandedElements[parent],
        type: 'checkbox',
        children: features
          .sort((a, b) => a.feature.localeCompare(b.feature))
          .map((feature) => {
            return {
              title: feature.feature,
              type: 'checkbox',
              checked: selectedFeatures.some(
                (selectedFeature) => selectedFeature === feature.feature,
              ),
            };
          }),
      }));
  }

  useEffect(() => {
    setFeatureCheckboxData(generateCheckboxStructure());
  }, [selectedFeatures]);

  return (
    <>
      <SearchHeader variant='h6' className='no-collapse'>
        {t('dataType')}
      </SearchHeader>
      <NestedCheckboxList
        debounceTime={500}
        checkboxData={dataTypesCheckboxData}
        onCheckboxChange={(checkboxData) => {
          const checkedFeedTypes = {
            ...selectedFeedTypes,
            gtfs: checkboxData[0].checked,
            gtfs_rt: checkboxData[1].checked,
            gbfs: checkboxData[2].checked,
          };
          setSelectedFeedTypes(checkedFeedTypes);
        }}
      ></NestedCheckboxList>

      <>
        <SearchHeader
          variant='h6'
          sx={isOfficialTagFilterEnabled ? {} : { opacity: 0.5 }}
          className='no-collapse'
        >
          Tags
        </SearchHeader>
        <Box sx={{ '& .MuiList-root': { py: 0 } }}>
          <NestedCheckboxList
            disableAll={!isOfficialTagFilterEnabled}
            checkboxData={[
              {
                title: 'Official Feeds',
                checked: isOfficialFeedSearch,
                type: 'checkbox',
              },
            ]}
            onCheckboxChange={(checkboxData) => {
              setIsOfficialFeedSearch(checkboxData[0].checked);
            }}
          ></NestedCheckboxList>

          {isSealOfReliabilityLive &&
            (!areFeatureFiltersEnabled || isSealAccessPending ? (
              <SealFilterRow checked={hasSealFeedSearch} disabled />
            ) : hasNoSealAccess ? (
              <SealFilterRow
                checked={false}
                locked
                onClick={(e) => {
                  setSealAccessPopoverAnchor(e.currentTarget);
                }}
              />
            ) : (
              <NestedCheckboxList
                checkboxData={[
                  {
                    title: 'Seal of Reliability',
                    checked: hasSealFeedSearch,
                    type: 'checkbox',
                  },
                ]}
                onCheckboxChange={(checkboxData) => {
                  setHasSealFeedSearch(checkboxData[0].checked);
                }}
              ></NestedCheckboxList>
            ))}
        </Box>

        {isSealOfReliabilityLive && (
          <MuiLink
            component={Link}
            href='/seal-of-reliability'
            target='_blank'
            variant='caption'
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.25,
              mt: 0.5,
            }}
          >
            {t('sealOfReliabilityLearnMore')}
            <OpenInNewIcon sx={{ fontSize: '0.9rem' }} />
          </MuiLink>
        )}

        <AccessRequiredPopover
          anchorEl={sealAccessPopoverAnchor}
          onClose={() => {
            setSealAccessPopoverAnchor(null);
          }}
          title='Seal of Reliability Filtering Access Required'
          description='This feature requires a MobilityData membership. Log in or request access to continue'
          requestAccessUrl={EARLY_ACCESS_REQUEST_FORM_URL}
        />
      </>

      <Accordion
        disableGutters
        sx={{ border: 0 }}
        variant={'outlined'}
        expanded={expandedCategories.features && areFeatureFiltersEnabled}
        onChange={() => {
          setExpandedCategories({
            ...expandedCategories,
            features: !expandedCategories.features,
          });
        }}
      >
        <AccordionSummary
          expandIcon={<ExpandMoreIcon />}
          aria-controls='panel1bh-content'
          sx={{
            px: 0,
          }}
        >
          <SearchHeader
            variant='h6'
            sx={areFeatureFiltersEnabled ? {} : { opacity: 0.5 }}
          >
            Features
          </SearchHeader>
        </AccordionSummary>
        <AccordionDetails
          sx={{
            p: 0,
            m: 0,
            border: 0,
            '&.Mui-expanded': { m: 0, minHeight: 'initial' },
          }}
        >
          <NestedCheckboxList
            disableAll={!areFeatureFiltersEnabled}
            debounceTime={500}
            checkboxData={featureCheckboxData}
            onExpandGroupChange={(checkboxData) => {
              const newExpandGroup: Record<string, boolean> = {};
              checkboxData.forEach((cd) => {
                if (cd.seeChildren !== undefined) {
                  newExpandGroup[cd.title] = cd.seeChildren;
                }
              });
              setExpandedElements({
                ...expandedElements,
                ...newExpandGroup,
              });
            }}
            onCheckboxChange={(checkboxData) => {
              const selelectedFeatures: string[] = [];
              checkboxData.forEach((checkbox) => {
                if (checkbox.children !== undefined) {
                  checkbox.children.forEach((child) => {
                    if (child.checked) {
                      selelectedFeatures.push(child.title);
                    }
                  });
                }
              });
              setSelectedFeatures([...selelectedFeatures]);
            }}
          />
        </AccordionDetails>
      </Accordion>

      <Accordion
        disableGutters
        variant={'outlined'}
        sx={{
          border: 0,
          '&::before': {
            display: 'none',
          },
        }}
        expanded={expandedCategories.gbfsVersions && areGBFSFiltersEnabled}
        onChange={() => {
          setExpandedCategories({
            ...expandedCategories,
            gbfsVersions: !expandedCategories.gbfsVersions,
          });
        }}
      >
        <AccordionSummary
          expandIcon={<ExpandMoreIcon />}
          aria-controls='panel1bh-content'
          sx={{
            px: 0,
          }}
        >
          <SearchHeader
            variant='h6'
            sx={areGBFSFiltersEnabled ? {} : { opacity: 0.5 }}
          >
            GBFS Versions
          </SearchHeader>
        </AccordionSummary>
        <AccordionDetails sx={{ p: 0, m: 0, border: 0 }}>
          <NestedCheckboxList
            disableAll={!areGBFSFiltersEnabled}
            debounceTime={500}
            checkboxData={gbfsVersionsObject.map((version) => ({
              title: version,
              checked: selectedGbfsVersions.includes(version),
              type: 'checkbox',
            }))}
            onCheckboxChange={(checkboxData) => {
              const selectedVersions: string[] = [];
              checkboxData.forEach((checkbox) => {
                if (checkbox.checked) {
                  selectedVersions.push(checkbox.title);
                }
              });
              setSelectedGbfsVerions([...selectedVersions]);
            }}
          ></NestedCheckboxList>
        </AccordionDetails>
      </Accordion>

      <Accordion
        disableGutters
        variant={'outlined'}
        sx={{
          border: 0,
          '&::before': {
            display: 'none',
          },
        }}
        expanded={expandedCategories.licenses}
        onChange={() => {
          setExpandedCategories({
            ...expandedCategories,
            licenses: !expandedCategories.licenses,
          });
        }}
      >
        <AccordionSummary
          expandIcon={<ExpandMoreIcon />}
          aria-controls='panel-licenses-content'
          sx={{
            px: 0,
          }}
        >
          <SearchHeader variant='h6'>Licenses</SearchHeader>
        </AccordionSummary>
        <AccordionDetails sx={{ p: 0, m: 0, border: 0 }}>
          <NestedCheckboxList
            debounceTime={500}
            checkboxData={[
              {
                title: 'CC-BY-4.0',
                checked: selectedLicenses.includes('CC-BY-4.0'),
                type: 'checkbox',
              },
              {
                title: 'etalab-2.0',
                checked: selectedLicenses.includes('etalab-2.0'),
                type: 'checkbox',
              },
              {
                title: 'CC0-1.0',
                checked: selectedLicenses.includes('CC0-1.0'),
                type: 'checkbox',
              },
              {
                title: 'ODbL-1.0',
                checked: selectedLicenses.includes('ODbL-1.0'),
                type: 'checkbox',
              },
              {
                title: 'OGL-UK-3.0',
                checked: selectedLicenses.includes('OGL-UK-3.0'),
                type: 'checkbox',
              },
            ]}
            onCheckboxChange={(checkboxData) => {
              const selectedLicenseIds: string[] = [];
              checkboxData.forEach((checkbox) => {
                if (checkbox.checked) {
                  selectedLicenseIds.push(checkbox.title);
                }
              });
              setSelectedLicenses([...selectedLicenseIds]);
            }}
          ></NestedCheckboxList>
        </AccordionDetails>
      </Accordion>

      <Accordion
        disableGutters
        variant={'outlined'}
        sx={{
          border: 0,
          '&::before': {
            display: 'none',
          },
        }}
        expanded={expandedCategories.licenseTags}
        onChange={() => {
          setExpandedCategories({
            ...expandedCategories,
            licenseTags: !expandedCategories.licenseTags,
          });
        }}
      >
        <AccordionSummary
          expandIcon={<ExpandMoreIcon />}
          aria-controls='panel-license-tags-content'
          sx={{
            px: 0,
          }}
        >
          <SearchHeader variant='h6'>License Tags</SearchHeader>
        </AccordionSummary>
        <AccordionDetails sx={{ p: 0, m: 0, border: 0 }}>
          <NestedCheckboxList
            debounceTime={500}
            checkboxData={LICENSE_TAGS.map((tag) => ({
              title: tag,
              checked: selectedLicenseTags.includes(tag),
              type: 'checkbox',
            }))}
            onCheckboxChange={(checkboxData) => {
              const selectedTagIds: string[] = [];
              checkboxData.forEach((checkbox) => {
                if (checkbox.checked) {
                  selectedTagIds.push(checkbox.title);
                }
              });
              setSelectedLicenseTags([...selectedTagIds]);
            }}
          ></NestedCheckboxList>
        </AccordionDetails>
      </Accordion>
    </>
  );
}
