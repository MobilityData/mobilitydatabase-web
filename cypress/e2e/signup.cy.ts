describe('Sign up screen', () => {
  beforeEach(() => {
    cy.visit('/sign-up');
  });

  it('should render components', () => {
    cy.get('input[id="email"]').should('exist');
    cy.get('input[id="password"]').should('exist');
    cy.get('input[id="confirmPassword"]').should('exist');
    cy.get('button[id="sign-up-button"]').should('exist');
    cy.get('input[id="agreeToTerms"]').should('exist');
    cy.get('iframe[title="reCAPTCHA"]').should('exist');
  });

  it('should show the password error when password length is less than 12', () => {
    cy.get('input[id="password"]').type('short', { force: true });
    cy.get('input[id="agreeToTerms"]').check();
    cy.get('button[id="sign-up-button"]').click();
    cy.get('[data-testid=passwordError]')
      .should('exist')
      .contains('Password must');
  });

  it('should show the password error when password do not contain lowercase', () => {
    cy.get('input[id="password"]').type('UPPERCASE_10_!', { force: true });
    cy.get('input[id="agreeToTerms"]').check();
    cy.get('button[id="sign-up-button"]').click();
    cy.get('[data-testid=passwordError]')
      .should('exist')
      .contains('Password must');
  });

  it('should show the password error when password do not contain uppercase', () => {
    cy.get('input[id="password"]').type('lowercase_10_!', { force: true });
    cy.get('input[id="agreeToTerms"]').check();
    cy.get('button[id="sign-up-button"]').click();
    cy.get('[data-testid=passwordError]')
      .should('exist')
      .contains('Password must');
  });

  it('should not show the password error when password is valid', () => {
    cy.get('input[id="password"]').type('UP_lowercase_10_!', { force: true });
    cy.get('[data-testid=passwordError]').should('not.exist');
  });

  it('should show the password error when password do not match', () => {
    cy.get('input[id="password"]').type('UP_lowercase_10_!', { force: true });
    cy.get('input[id="agreeToTerms"]').check();
    cy.get('button[id="sign-up-button"]').click();
    cy.get('input[id="confirmPassword"]').type('UP_lowercase_11_!', {
      force: true,
    });

    cy.get('[data-testid=confirmPasswordError]')
      .should('exist')
      .contains('Passwords do not match');
  });

  it('should disable sign up button when the terms and condition not accepted', () => {
    cy.get('input[id="agreeToTerms"]').should('exist');
    cy.get('button[id="sign-up-button"]').should('be.disabled');
  });

  it('should show the captcha error when is not accepted', () => {
    cy.get('input[id="agreeToTerms"]').check();
    cy.get('iframe[title="reCAPTCHA"]').should('exist');
    cy.get('button[id="sign-up-button"]').click();

    cy.get('[data-testid=reCaptchaError]')
      .should('exist')
      .contains('You must verify you are not a robot.');
  });
});

describe('Sign up full registration flow', () => {
  const email = 'cypressSignUpFlowTest@mobilitydata.org';
  const password = 'IloveOrangeCones123!';

  const unverifiedUser = {
    email,
    isRegistered: false,
    isEmailVerified: false,
    isRegisteredToReceiveAPIAnnouncements: false,
    isAnonymous: false,
    refreshToken: '',
  };

  /**
   * Fills and submits the complete-registration form.
   * Intercepts PUT /v1/user so the saga succeeds without a real API.
   */
  const completeRegistration = (): void => {
    cy.intercept('PUT', '**/v1/user', { statusCode: 200, body: {} }).as(
      'updateUser',
    );
    cy.get('input[id="fullName"]').type('Test User');
    cy.get('input[id="agreeToTerms"]').check({ force: true });
    cy.get('input[id="agreeToPrivacyPolicy"]').check({ force: true });
    cy.contains('button', 'Finish Account Setup').click();
    cy.wait('@updateUser');
  };

  beforeEach(() => {
    // Create a real Firebase emulator user and sign in so that the
    // complete-registration saga can obtain an access token, but leave
    // Redux state untouched so each test can set the exact status it needs.
    cy.createNewUserAndSignIn(email, password);
  });

  it('should redirect verify-email → complete-registration → contribute when signed up with add_feed=true', () => {
    cy.visit('/verify-email?add_feed=true');
    cy.contains('Check your email').should('exist');

    // Simulate arriving here right after sign-up (email not yet verified)
    cy.window().its('store').invoke('dispatch', {
      type: 'userProfile/signUpSuccess',
      payload: unverifiedUser,
    });

    // Simulate the user clicking the email verification link
    cy.window().its('store').invoke('dispatch', {
      type: 'userProfile/emailVerified',
    });

    cy.location('pathname', { timeout: 10000 }).should(
      'eq',
      '/complete-registration',
    );
    cy.location('search').should('include', 'add_feed=true');

    completeRegistration();

    cy.location('pathname', { timeout: 10000 }).should('eq', '/contribute');
  });

  it('should redirect verify-email → complete-registration → redirect_to path when signed up with redirect_to', () => {
    const redirectPath = '/feeds';
    cy.visit(
      `/verify-email?redirect_to=${encodeURIComponent(redirectPath)}`,
    );
    cy.contains('Check your email').should('exist');

    cy.window().its('store').invoke('dispatch', {
      type: 'userProfile/signUpSuccess',
      payload: unverifiedUser,
    });

    cy.window().its('store').invoke('dispatch', {
      type: 'userProfile/emailVerified',
    });

    cy.location('pathname', { timeout: 10000 }).should(
      'eq',
      '/complete-registration',
    );
    cy.location('search').should(
      'include',
      `redirect_to=${encodeURIComponent(redirectPath)}`,
    );

    completeRegistration();

    cy.location('pathname', { timeout: 10000 }).should('eq', redirectPath);
  });

  it('should redirect verify-email → complete-registration → account on normal sign up', () => {
    cy.visit('/verify-email');
    cy.contains('Check your email').should('exist');

    cy.window().its('store').invoke('dispatch', {
      type: 'userProfile/signUpSuccess',
      payload: unverifiedUser,
    });

    cy.window().its('store').invoke('dispatch', {
      type: 'userProfile/emailVerified',
    });

    cy.location('pathname', { timeout: 10000 }).should(
      'eq',
      '/complete-registration',
    );

    completeRegistration();

    cy.location('pathname', { timeout: 10000 }).should('eq', '/account');
  });
});
