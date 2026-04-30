import React, { useEffect } from 'react';
import FormFirstStep from './FirstStep';
import FormSecondStep from './SecondStep';
import FormSecondStepRT from './SecondStepRealtime';
import FormFourthStep from './FourthStep';
import {
  Stepper,
  Step,
  StepLabel,
  Box,
  CircularProgress,
  Typography,
} from '@mui/material';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import FormThirdStep from './ThirdStep';
import { submitNewFeedForm } from '../../../../services/feeds/add-feed-form-service';
import { useTranslations } from 'next-intl';
import { type FeedSubmissionFormFormInput, type YesNoFormInput } from './types';

const defaultFormValues: FeedSubmissionFormFormInput = {
  isOfficialProducer: '',
  isOfficialFeed: undefined,
  dataType: 'gtfs',
  transitProviderName: '',
  feedLink: '',
  oldFeedLink: '',
  isUpdatingFeed: 'no',
  licensePath: '',
  country: '',
  region: '',
  municipality: '',
  tripUpdates: '',
  vehiclePositions: '',
  serviceAlerts: '',
  oldTripUpdates: '',
  oldVehiclePositions: '',
  oldServiceAlerts: '',
  gtfsRelatedScheduleLink: '',
  name: '',
  authType: 'None - 0',
  authSignupLink: '',
  authParameterName: '',
  dataProducerEmail: '',
  isInterestedInQualityAudit: '',
  userInterviewEmail: '',
  whatToolsUsedText: '',
  hasLogoPermission: '',
  unofficialDesc: '',
  updateFreq: '',
  emptyLicenseUsage: '',
};

export default function FeedSubmissionForm(): React.ReactElement {
  const t = useTranslations('feeds');
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [isSubmitLoading, setIsSubmitLoading] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<undefined | string>(
    undefined,
  );
  const [steps, setSteps] = React.useState(['', '', '']);
  const [formData, setFormData] =
    React.useState<FeedSubmissionFormFormInput>(defaultFormValues);
  const [stepsCompleted, setStepsCompleted] = React.useState({
    '1': false,
    '2': false,
    '3': false,
  });

  const currentStep =
    searchParams.get('step') === null ? 1 : Number(searchParams.get('step'));

  // route guards
  useEffect(() => {
    const step = searchParams.get('step') ?? '1';

    if (step === '2' || step === '3' || step === '4') {
      if (!stepsCompleted['1']) {
        router.push(pathname);
      }
      return;
    }

    if (step === '3' || step === '4') {
      if (!stepsCompleted['2']) {
        router.push(`${pathname}?step=1`);
      }
      return;
    }

    if (step === '4') {
      if (!stepsCompleted['3'] || !(formData.isOfficialProducer === 'yes')) {
        router.push(`${pathname}?step=3`);
      }
      return;
    }
    setSubmitError(undefined);
  }, [
    searchParams,
    stepsCompleted,
    formData.isOfficialProducer,
    router,
    pathname,
  ]);

  const handleNext = (): void => {
    const nextStep =
      searchParams.get('step') === null
        ? 2
        : Number(searchParams.get('step')) + 1;
    setStepsCompleted({ ...stepsCompleted, [currentStep]: true });
    if (nextStep === steps.length + 1) {
      router.push('/contribute/submitted');
    } else {
      router.push(`${pathname}?step=${nextStep}`);
    }
  };

  const handleBack = (): void => {
    const previousStep = (currentStep - 1).toString();
    if (previousStep === '1') {
      router.push(pathname);
    } else {
      router.push(`${pathname}?step=${previousStep}`);
    }
  };

  const setNumberOfSteps = (isOfficialProducer: YesNoFormInput): void => {
    if (isOfficialProducer === 'yes') {
      setSteps(['', '', '', '']);
    } else {
      setSteps(['', '', '']);
    }
  };

  const formStepSubmit = (
    partialFormData: Partial<FeedSubmissionFormFormInput>,
  ): void => {
    setFormData((prevData: FeedSubmissionFormFormInput) => ({
      ...prevData,
      ...partialFormData,
    }));
    handleNext();
  };

  const formStepBack = (
    partialFormData: Partial<FeedSubmissionFormFormInput>,
  ): void => {
    setFormData((prevData: FeedSubmissionFormFormInput) => ({
      ...prevData,
      ...partialFormData,
    }));
    handleBack();
  };

  const finalSubmit = async (
    partialFormData: Partial<FeedSubmissionFormFormInput>,
  ): Promise<void> => {
    const finalData = { ...formData, ...partialFormData };
    setIsSubmitLoading(true);
    setFormData(finalData);
    try {
      const requestBody = { ...finalData };
      await submitNewFeedForm(requestBody);
      handleNext();
    } catch (error) {
      setSubmitError(t('form.errorSubmitting'));
    } finally {
      setIsSubmitLoading(false);
    }
  };

  if (isSubmitLoading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          flexWrap: 'wrap',
        }}
      >
        <CircularProgress />
        <Typography
          variant='h6'
          sx={{ width: '100%', textAlign: 'center', mt: 2 }}
        >
          {t('form.submittingFeed')}
        </Typography>
      </Box>
    );
  }

  if (submitError !== undefined) {
    return <Typography>{submitError}</Typography>;
  }

  return (
    <>
      <Stepper
        activeStep={currentStep - 1}
        sx={{ mb: 3, width: steps.length === 2 ? 'calc(50% + 24px)' : '100%' }}
      >
        {steps.map((label, index) => {
          const stepProps: { completed?: boolean } = {};
          const labelProps: {
            optional?: React.ReactNode;
          } = {};
          return (
            <Step key={index} {...stepProps}>
              <StepLabel {...labelProps}>{label}</StepLabel>
            </Step>
          );
        })}
      </Stepper>
      {currentStep === 1 && (
        <FormFirstStep
          initialValues={formData}
          submitFormData={formStepSubmit}
          setNumberOfSteps={setNumberOfSteps}
        ></FormFirstStep>
      )}
      {currentStep === 2 && formData.dataType === 'gtfs' && (
        <FormSecondStep
          initialValues={formData}
          submitFormData={formStepSubmit}
          handleBack={formStepBack}
        ></FormSecondStep>
      )}
      {currentStep === 2 && formData.dataType === 'gtfs_rt' && (
        <FormSecondStepRT
          initialValues={formData}
          submitFormData={formStepSubmit}
          handleBack={formStepBack}
        ></FormSecondStepRT>
      )}
      {currentStep === 3 && (
        <FormThirdStep
          initialValues={formData}
          submitFormData={(submittedFormData) => {
            if (currentStep === steps.length) {
              void finalSubmit(submittedFormData);
            } else {
              formStepSubmit(submittedFormData);
            }
          }}
          handleBack={formStepBack}
        ></FormThirdStep>
      )}
      {currentStep === 4 && (
        <FormFourthStep
          initialValues={formData}
          submitFormData={(submittedFormData) => {
            void finalSubmit(submittedFormData);
          }}
          handleBack={formStepBack}
        ></FormFourthStep>
      )}
    </>
  );
}
