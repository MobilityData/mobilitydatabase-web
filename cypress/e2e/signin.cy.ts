describe('Sign In page', () => {
  const email = 'cypressSignInTest@mobilitydata.org';
  const password = 'IloveOrangeCones123!';

  describe('renders', () => {
    beforeEach(() => {
      cy.visit('/sign-in');
    });

    it('should render page header', () => {
      cy.get('[data-testid=websiteTile]')
        .should('exist')
        .contains('MobilityDatabase');
    });

    it('should render signin form', () => {
      cy.get('[data-testid=signin]').should('exist');
    });
  });

  describe('redirect after sign-in', () => {
    it('should redirect to the contribute page when signed in with add_feed=true', () => {
      cy.createNewUserAndSignIn(email, password);
      cy.visit('/sign-in?add_feed=true');
      cy.injectAuthenticatedUser(email);
      cy.get('[data-testid=signin]').should('exist');
      cy.location('pathname', { timeout: 10000 }).should('eq', '/contribute');
    });

    it('should redirect to the redirect_to path after sign-in', () => {
      const redirectPath = '/feeds';
      cy.createNewUserAndSignIn(email, password);
      cy.visit(`/sign-in?redirect_to=${encodeURIComponent(redirectPath)}`);
      cy.injectAuthenticatedUser(email);
      cy.get('[data-testid=signin]').should('exist');
      cy.location('pathname', { timeout: 10000 }).should('eq', redirectPath);
    });

    it('should redirect to complete-registration when the account is in authenticated state', () => {
      cy.visit('/sign-in');
      cy.get('[data-testid=signin]').should('exist');
      cy.window()
        .its('store')
        .invoke('dispatch', {
          type: 'userProfile/loginSuccess',
          payload: {
            fullName: 'Test User',
            email,
            isRegistered: false,
            isEmailVerified: true,
            organization: undefined,
            isRegisteredToReceiveAPIAnnouncements: false,
            isAnonymous: false,
            refreshToken: '',
          },
        });
      cy.location('pathname', { timeout: 10000 }).should(
        'eq',
        '/complete-registration',
      );
    });
  });
});
