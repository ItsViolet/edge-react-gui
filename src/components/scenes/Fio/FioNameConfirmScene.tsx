import { EdgeCurrencyConfig } from 'edge-core-js'
import * as React from 'react'
import { View } from 'react-native'

import { FIO_ADDRESS_DELIMITER } from '../../../constants/WalletAndCurrencyConstants'
import { lstrings } from '../../../locales/strings'
import { connect } from '../../../types/reactRedux'
import { EdgeSceneProps } from '../../../types/routerTypes'
import { fioMakeSpend, fioSignAndBroadcast } from '../../../util/FioAddressUtils'
import { logEvent, TrackingEventName, TrackingValues } from '../../../util/tracking'
import { SceneWrapper } from '../../common/SceneWrapper'
import { FioActionSubmit } from '../../FioAddress/FioActionSubmit'
import { ButtonsModal } from '../../modals/ButtonsModal'
import { Airship, showError } from '../../services/AirshipInstance'
import { cacheStyles, Theme, ThemeProps, withTheme } from '../../services/ThemeContext'
import { SceneHeader } from '../../themed/SceneHeader'
import { CardUi4 } from '../../ui4/CardUi4'
import { RowUi4 } from '../../ui4/RowUi4'

interface StateProps {
  fioPlugin?: EdgeCurrencyConfig
  isConnected: boolean
}

interface OwnProps extends EdgeSceneProps<'fioDomainConfirm' | 'fioNameConfirm'> {}

interface DispatchProps {
  onLogEvent: (event: TrackingEventName, values: TrackingValues) => void
}

type Props = StateProps & OwnProps & ThemeProps & DispatchProps

const ONE_FREE_ADDRESS_PER_DOMAIN_ERROR = 'ONE_FREE_ADDRESS_PER_DOMAIN_ERROR'

class FioNameConfirm extends React.PureComponent<Props> {
  isFioAddress = () => {
    const { fioName } = this.props.route.params
    return fioName.includes(FIO_ADDRESS_DELIMITER)
  }

  getFee = async () => {
    const { fee } = this.props.route.params
    return fee
  }

  saveFioName = async () => {
    const { navigation, route, onLogEvent } = this.props
    const { fioName, paymentWallet, ownerPublicKey, fee } = route.params

    const { isConnected, fioPlugin } = this.props
    if (!isConnected) {
      throw new Error(lstrings.fio_network_alert_text)
    }

    if (!fee) {
      if (this.isFioAddress()) {
        if (!fioPlugin) {
          throw new Error(lstrings.fio_register_address_err_msg)
        }
        const response = await fioPlugin.otherMethods.buyAddressRequest(
          {
            address: fioName,
            referralCode: fioPlugin.currencyInfo.defaultSettings?.defaultRef,
            publicKey: ownerPublicKey
          },
          true
        )
        if (response.error) {
          if (response.errorCode && response.errorCode === ONE_FREE_ADDRESS_PER_DOMAIN_ERROR && response.code === 400) {
            const publicDomains = await fioPlugin.otherMethods.getDomains(fioPlugin.currencyInfo.defaultSettings?.fallbackRef)
            // @ts-expect-error
            const domainExists = publicDomains.find(domain => domain.domain === fioName.split(FIO_ADDRESS_DELIMITER)[1])
            if (domainExists && !domainExists.free) {
              await Airship.show<'ok' | undefined>(bridge => (
                <ButtonsModal
                  bridge={bridge}
                  title={lstrings.fio_address_register_pay_title}
                  message={lstrings.fio_address_register_pay}
                  buttons={{ ok: { label: lstrings.string_ok_cap } }}
                />
              ))
              return navigation.navigate('fioAddressRegisterSelectWallet', {
                fioAddress: fioName,
                selectedWallet: paymentWallet,
                selectedDomain: {
                  name: domainExists.domain,
                  expiration: new Date().toDateString(),
                  isPublic: true,
                  walletId: '',
                  isFree: domainExists.free
                },
                isFallback: true
              })
            }
          }
          throw new Error(response.error)
        }

        await Airship.show<'ok' | undefined>(bridge => (
          <ButtonsModal
            bridge={bridge}
            title={`${lstrings.fio_address_register_form_field_label} ${lstrings.fragment_wallet_unconfirmed}`}
            message={lstrings.fio_address_register_pending_free}
            buttons={{ ok: { label: lstrings.string_ok_cap } }}
          />
        ))
        navigation.navigate('homeTab', { screen: 'home' })
      } else {
        // no free domains
        showError(lstrings.fio_get_fee_err_msg)
      }
    } else {
      try {
        const { currencyCode, pluginId } = paymentWallet.currencyInfo
        if (this.isFioAddress()) {
          let edgeTx = await fioMakeSpend(paymentWallet, 'registerFioAddress', { fioAddress: fioName })
          edgeTx = await fioSignAndBroadcast(paymentWallet, edgeTx)
          await paymentWallet.saveTx(edgeTx)

          onLogEvent('Fio_Handle_Register', {
            nativeAmount: edgeTx.nativeAmount,
            currencyCode,
            pluginId
          })

          // @ts-expect-error
          window.requestAnimationFrame(() =>
            navigation.navigate('fioAddressRegisterSuccess', {
              fioName
            })
          )
        } else {
          let edgeTx = await fioMakeSpend(paymentWallet, 'registerFioDomain', { fioDomain: fioName })
          edgeTx = await fioSignAndBroadcast(paymentWallet, edgeTx)
          await paymentWallet.saveTx(edgeTx)
          const expiration = edgeTx.otherParams?.broadcastResult?.expiration

          onLogEvent('Fio_Domain_Register', {
            nativeAmount: edgeTx.nativeAmount,
            currencyCode,
            pluginId
          })

          // @ts-expect-error
          window.requestAnimationFrame(() =>
            navigation.navigate('fioAddressRegisterSuccess', {
              fioName,
              expiration
            })
          )
        }
      } catch (e: any) {
        showError(lstrings.fio_register_address_err_msg)
      }
    }
  }

  render() {
    const { route, theme, navigation } = this.props
    const { fioName, paymentWallet } = route.params
    const styles = getStyles(theme)

    return (
      <SceneWrapper scroll>
        <SceneHeader title={this.isFioAddress() ? lstrings.title_fio_address_confirmation : lstrings.title_register_fio_domain} underline withTopMargin />
        <View style={styles.scene}>
          <CardUi4>
            <RowUi4
              title={this.isFioAddress() ? lstrings.fio_address_confirm_screen_label : lstrings.fio_domain_label}
              body={this.isFioAddress() ? fioName : `${FIO_ADDRESS_DELIMITER}${fioName}`}
            />
          </CardUi4>
          <FioActionSubmit
            onSubmit={this.saveFioName}
            getOperationFee={this.getFee}
            fioWallet={paymentWallet}
            navigation={this.props.navigation}
            onCancel={() => navigation.goBack()}
          />
        </View>
      </SceneWrapper>
    )
  }
}

const getStyles = cacheStyles((theme: Theme) => ({
  scene: {
    alignItems: 'stretch',
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'flex-start',
    marginHorizontal: theme.rem(0.5),
    paddingTop: theme.rem(0.5)
  }
}))

export const FioNameConfirmScene = connect<StateProps, DispatchProps, OwnProps>(
  state => ({
    fioPlugin: state.core.account.currencyConfig.fio,
    isConnected: state.network.isConnected
  }),
  dispatch => ({
    onLogEvent(event: TrackingEventName, values: TrackingValues) {
      dispatch(logEvent(event, values))
    }
  })
)(withTheme(FioNameConfirm))
