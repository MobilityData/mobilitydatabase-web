import React from 'react';
import { Routes, Route } from 'react-router-dom';
import ForgotPassword from '../screens/ForgotPassword';
import FeedSubmission from '../screens/FeedSubmission';
import FeedSubmitted from '../screens/FeedSubmitted';
import GTFSFeedAnalytics from '../screens/Analytics/GTFSFeedAnalytics';
import GTFSNoticeAnalytics from '../screens/Analytics/GTFSNoticeAnalytics';
import GTFSFeatureAnalytics from '../screens/Analytics/GTFSFeatureAnalytics';
import GBFSFeedAnalytics from '../screens/Analytics/GBFSFeedAnalytics';
import GBFSNoticeAnalytics from '../screens/Analytics/GBFSNoticeAnalytics';
import GBFSVersionAnalytics from '../screens/Analytics/GBFSVersionAnalytics';

export const AppRouter: React.FC = () => {
  return (
    <Routes>
      <Route path='forgot-password' element={<ForgotPassword />} />
      <Route path='contribute' element={<FeedSubmission />} />
      <Route path='contribute/submitted' element={<FeedSubmitted />} />
      <Route path='metrics/gtfs'>
        <Route index element={<GTFSFeedAnalytics />} />
        <Route path='feeds/*' element={<GTFSFeedAnalytics />} />
        <Route path='notices/*' element={<GTFSNoticeAnalytics />} />
        <Route path='features/*' element={<GTFSFeatureAnalytics />} />
      </Route>
      <Route path='metrics/gbfs'>
        <Route path='feeds/*' element={<GBFSFeedAnalytics />} />
        <Route path='notices/*' element={<GBFSNoticeAnalytics />} />
        <Route path='versions/*' element={<GBFSVersionAnalytics />} />
      </Route>
    </Routes>
  );
};

export default AppRouter;
