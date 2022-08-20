// @flow

import { type Cleaner, asArray, asJSON, asObject, asOptional, asString, asValue } from 'cleaners'

//
// Store Types
//

export type LoanProgramType = 'loan-create' | 'loan-deposit' | 'loan-borrow' | 'loan-repay' | 'loan-withdraw'
export type LoanProgramEdge = {
  programId: string,
  programType: LoanProgramType
}
export const asLoanProgramEdge: Cleaner<LoanProgramEdge> = asObject({
  programId: asString,
  programType: asValue('loan-create', 'loan-deposit', 'loan-borrow', 'loan-repay', 'loan-withdraw')
})

export type LoanAccountEntry = {
  walletId: string,
  borrowPluginId: string,
  programEdges: LoanProgramEdge[]
}
export const asLoanAccountEntry: Cleaner<LoanAccountEntry> = asObject({
  walletId: asString,
  borrowPluginId: asString,
  programEdges: asArray(asLoanProgramEdge)
})

//
// Persisted Data (changes require data migration)
//

// Keys:
export const LOAN_MANAGER_STORE_ID = 'loanManager'
export const LOAN_ACCOUNT_MAP = 'loanAccountMap'

// Records:
export type LoanAccountMapRecord = {
  [pluginId: string]: LoanAccountEntry
}
export const asLoanAccountMapRecord: Cleaner<LoanAccountMapRecord> = asOptional(asJSON(asObject(asLoanAccountEntry)), {})
