describe('Home page', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('should render page header', () => {
    cy.get('[data-testid=websiteTile]')
      .should('exist')
      .contains('MobilityDatabase');
  });

  it('should render home page title', () => {
    cy.get('[data-testid=home-title]').should('exist');
  });
});
