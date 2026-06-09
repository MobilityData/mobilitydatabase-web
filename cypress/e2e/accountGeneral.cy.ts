describe('Account General Page', () => {
  const password = 'IloveOrangeCones123!';
  const email = 'cypressTestUser@mobilitydata.org';
  beforeEach(() => {
    cy.visit('/');
    cy.get('[data-testid="home-title"]').should('exist');
    cy.createNewUserAndSignIn(email, password);
    cy.get('[data-cy="accountHeader"]').should('exist').click();
    cy.location('pathname').should('eq', '/account');
  });

  describe('renders initial elements', () => {
    it('should render the Personal Information section', () => {
      cy.contains('Personal Information').should('exist');
      cy.contains('Your account details and contact information').should(
        'exist',
      );
      cy.contains('button', 'Edit').should('exist');
      cy.contains('label', 'Name').should('exist');
      cy.contains('label', 'Email').should('exist');
      cy.contains('label', 'Organization').should('exist');
    });

    it('should render the Account Support section', () => {
      cy.contains('Account Support').should('exist');
      cy.contains('api@mobilitydata.org').should('exist');
      cy.get('[data-cy="changePasswordButtonAccount"]').should('exist');
    });
  });

  describe('editing user information', () => {
    it('should enter edit mode and show Cancel and Save buttons', () => {
      cy.contains('button', 'Edit').click();
      cy.contains('button', 'Cancel').should('exist');
      cy.contains('button', 'Save').should('exist');
      cy.contains('button', 'Edit').should('not.exist');
    });

    it('should cancel editing and return to view mode', () => {
      cy.contains('button', 'Edit').click();
      cy.contains('button', 'Cancel').click();
      cy.contains('button', 'Edit').should('exist');
      cy.contains('button', 'Cancel').should('not.exist');
      cy.contains('button', 'Save').should('not.exist');
    });

    it('should save updated full name and organization', () => {
      cy.intercept('PUT', '**/v1/user', {
        statusCode: 200,
        body: {},
      }).as('updateUser');

      cy.contains('button', 'Edit').click();

      cy.contains('label', 'Name')
        .invoke('attr', 'for')
        .then((id) => {
          cy.get(`#${id}`).clear().type('Updated Name');
        });

      cy.contains('label', 'Organization')
        .invoke('attr', 'for')
        .then((id) => {
          cy.get(`#${id}`).clear().type('Updated Organization');
        });

      cy.contains('button', 'Save').click();
      cy.wait('@updateUser');

      cy.contains('button', 'Edit').should('exist');
      cy.contains('button', 'Save').should('not.exist');

      cy.contains('label', 'Name')
        .invoke('attr', 'for')
        .then((id) => {
          cy.get(`#${id}`).should('have.value', 'Updated Name');
        });

      cy.contains('label', 'Organization')
        .invoke('attr', 'for')
        .then((id) => {
          cy.get(`#${id}`).should('have.value', 'Updated Organization');
        });
    });
  });

  describe('save error flow', () => {
    it('should show an error alert and keep the form open when the API call fails', () => {
      cy.intercept('PUT', '**/v1/user', {
        statusCode: 500,
        body: { message: 'Internal Server Error' },
      }).as('updateUserFail');

      cy.contains('button', 'Edit').click();

      cy.contains('label', 'Name')
        .invoke('attr', 'for')
        .then((id) => {
          cy.get(`#${id}`).clear().type('Will Not Save');
        });

      cy.contains('button', 'Save').click();
      cy.wait('@updateUserFail');

      // Form should remain open after a failure
      cy.contains('button', 'Save').should('exist');
      cy.contains('button', 'Cancel').should('exist');
      cy.contains('button', 'Edit').should('not.exist');

      // Error alert should be visible
      cy.contains('Failed to save account changes. Please try again.').should(
        'exist',
      );
    });

    it('should dismiss the error alert after 4 seconds', () => {
      cy.clock();

      cy.intercept('PUT', '**/v1/user', {
        statusCode: 500,
        body: { message: 'Internal Server Error' },
      }).as('updateUserFail');

      cy.contains('button', 'Edit').click();
      cy.contains('button', 'Save').click();
      cy.wait('@updateUserFail');

      cy.contains('Failed to save account changes. Please try again.').should(
        'exist',
      );

      cy.tick(4000);

      cy.contains('Failed to save account changes. Please try again.').should(
        'not.be.visible',
      );
    });

    it('should dismiss the error alert when clicking the close button', () => {
      cy.intercept('PUT', '**/v1/user', {
        statusCode: 500,
        body: { message: 'Internal Server Error' },
      }).as('updateUserFail');

      cy.contains('button', 'Edit').click();
      cy.contains('button', 'Save').click();
      cy.wait('@updateUserFail');

      cy.contains('Failed to save account changes. Please try again.')
        .closest('[role="alert"]')
        .find('button[aria-label="Close"]')
        .click();

      cy.contains('Failed to save account changes. Please try again.').should(
        'not.be.visible',
      );
    });
  });
});
