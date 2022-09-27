import { EdgeCurrencyWallet } from 'edge-core-js'
import * as React from 'react'
import { sprintf } from 'sprintf-js'

import { ButtonsModal } from '../components/modals/ButtonsModal'
import { Airship, showError } from '../components/services/AirshipInstance'
import { getSpecialCurrencyInfo } from '../constants/WalletAndCurrencyConstants'
import s from '../locales/strings'
import { setMostRecentWalletsSelected } from '../modules/Core/Account/settings'
import { Dispatch, GetState } from '../types/reduxTypes'
import { Actions } from '../types/routerTypes'
import { getCurrencyInfos, makeCreateWalletType } from '../util/CurrencyInfoHelpers'
import { getSupportedFiats } from '../util/utils'
import { refreshConnectedWallets } from './FioActions'
import { registerNotificationsV2 } from './NotificationActions'

export const selectWallet = (walletId: string, currencyCode: string, alwaysActivate?: boolean) => async (dispatch: Dispatch, getState: GetState) => {
  const state = getState()
  const { currencyWallets } = state.core.account

  // Manually un-pause the wallet, if necessary:
  const wallet: EdgeCurrencyWallet = currencyWallets[walletId]
  if (wallet.paused) wallet.changePaused(false).catch(showError)

  dispatch(updateMostRecentWalletsSelected(walletId, currencyCode))
  const { isAccountActivationRequired } = getSpecialCurrencyInfo(wallet.currencyInfo.pluginId)
  if (isAccountActivationRequired) {
    // EOS needs different path in case not activated yet
    const currentWalletId = state.ui.wallets.selectedWalletId
    const currentWalletCurrencyCode = state.ui.wallets.selectedCurrencyCode
    if (alwaysActivate || walletId !== currentWalletId || currencyCode !== currentWalletCurrencyCode) {
      await dispatch(selectEOSWallet(walletId, currencyCode))
    }
    return
  }
  const currentWalletId = state.ui.wallets.selectedWalletId
  const currentWalletCurrencyCode = state.ui.wallets.selectedCurrencyCode
  if (walletId !== currentWalletId || currencyCode !== currentWalletCurrencyCode) {
    dispatch({
      type: 'UI/WALLETS/SELECT_WALLET',
      data: { walletId, currencyCode }
    })
    const wallet: EdgeCurrencyWallet = currencyWallets[walletId]
    const receiveAddress = await wallet.getReceiveAddress({ currencyCode })
    dispatch({ type: 'NEW_RECEIVE_ADDRESS', data: { receiveAddress } })
  }
}

// check if the EOS wallet is activated (via public address blank string check) and route to activation scene(s)
const selectEOSWallet = (walletId: string, currencyCode: string) => async (dispatch: Dispatch, getState: GetState) => {
  const state = getState()
  const wallet = state.core.account.currencyWallets[walletId]
  const {
    fiatCurrencyCode,
    name,
    currencyInfo: { currencyCode, pluginId }
  } = wallet
  const walletName = name ?? ''
  const { publicAddress } = await wallet.getReceiveAddress()

  if (publicAddress !== '') {
    // already activated
    dispatch({
      type: 'UI/WALLETS/SELECT_WALLET',
      data: { walletId, currencyCode }
    })
  } else {
    // Update all wallets' addresses. Hopefully gets the updated address for the next time
    // We enter the EOSIO wallet
    dispatch(updateWalletsRequest())
    // not activated yet
    // find fiat and crypto (EOSIO) types and populate scene props
    const supportedFiats = getSupportedFiats()
    const fiatTypeIndex = supportedFiats.findIndex(fiatType => fiatType.value === fiatCurrencyCode.replace('iso:', ''))
    const selectedFiat = supportedFiats[fiatTypeIndex]
    const currencyInfos = getCurrencyInfos(state.core.account)
    const currencyInfo = currencyInfos.find(info => info.currencyCode === currencyCode)
    if (!currencyInfo) throw new Error('CannotFindCurrencyInfo')
    const selectedWalletType = makeCreateWalletType(currencyInfo)
    const specialCurrencyInfo = getSpecialCurrencyInfo(pluginId)
    if (specialCurrencyInfo.skipAccountNameValidation) {
      Actions.push('createWalletAccountSelect', {
        selectedFiat: selectedFiat,
        selectedWalletType,
        accountName: walletName,
        existingWalletId: walletId
      })
    } else {
      const createWalletAccountSetupSceneProps = {
        accountHandle: '',
        selectedWalletType,
        selectedFiat,
        isReactivation: true,
        existingWalletId: walletId
      }
      Actions.push('createWalletAccountSetup', createWalletAccountSetupSceneProps)
    }

    Airship.show<'ok' | undefined>(bridge => (
      <ButtonsModal
        bridge={bridge}
        title={s.strings.create_wallet_account_unfinished_activation_title}
        message={sprintf(s.strings.create_wallet_account_unfinished_activation_message, currencyCode)}
        buttons={{ ok: { label: s.strings.string_ok } }}
      />
    ))
  }
}

export const selectWalletFromModal = (walletId: string, currencyCode: string) => (dispatch: Dispatch, getState: GetState) => {
  dispatch(selectWallet(walletId, currencyCode))
}

export const updateWalletLoadingProgress = (walletId: string, newWalletProgress: number) => (dispatch: Dispatch, getState: GetState) => {
  const state = getState()
  const currentWalletProgress = state.ui.wallets.walletLoadingProgress[walletId]
  const marginalProgress = newWalletProgress - currentWalletProgress
  if (newWalletProgress !== 1 && marginalProgress < 0.1) return

  dispatch({
    type: 'UPDATE_WALLET_LOADING_PROGRESS',
    data: { walletId, addressLoadingProgress: newWalletProgress }
  })
}

export const updateMostRecentWalletsSelected = (walletId: string, currencyCode: string) => (dispatch: Dispatch, getState: GetState) => {
  const state = getState()
  const { account } = state.core
  const { mostRecentWallets } = state.ui.settings
  const currentMostRecentWallets = mostRecentWallets.filter(wallet => {
    return wallet.id !== walletId || wallet.currencyCode !== currencyCode
  })
  if (currentMostRecentWallets.length === 100) {
    currentMostRecentWallets.pop()
  }
  currentMostRecentWallets.unshift({ id: walletId, currencyCode })

  setMostRecentWalletsSelected(account, currentMostRecentWallets)
    .then(() => {
      dispatch({
        type: 'UI/SETTINGS/SET_MOST_RECENT_WALLETS',
        data: { mostRecentWallets: currentMostRecentWallets }
      })
    })
    .catch(showError)
}

// This gets called a bunch on launch so we need to limit it otherwise duplicate notifications will get registered
let limitRegistrations = false
export const updateWalletsRequest = () => async (dispatch: Dispatch, getState: GetState) => {
  const state = getState()
  const { account } = state.core
  const { activeWalletIds, currencyWallets } = account

  if (activeWalletIds.length === Object.keys(currencyWallets).length && !limitRegistrations) {
    limitRegistrations = true
    await dispatch(registerNotificationsV2())
    limitRegistrations = false
  }

  dispatch({
    type: 'CORE/WALLETS/UPDATE_WALLETS',
    data: {
      currencyWallets
    }
  })
  refreshConnectedWallets(dispatch, getState, currencyWallets)
}