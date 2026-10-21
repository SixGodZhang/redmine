# frozen_string_literal: true

module Studio
  class BaseController < ApplicationController
    layout false
    skip_before_action :verify_authenticity_token
    before_action :authenticate_studio_api_key

    rescue_from StandardError do |e|
      logger.error("[Studio] #{e.class}: #{e.message}\n#{e.backtrace.first(5).join("\n")}")
      render json: { errors: [e.message] }, status: :internal_server_error
    end

    private

    def require_studio_login
      return if User.current.logged?

      render json: { errors: [l(:label_login)] }, status: :unauthorized
    end

    def deny_access
      if User.current.logged?
        render json: { errors: [l(:error_not_authorized, default: 'Forbidden')] }, status: :forbidden
      else
        render json: { errors: [l(:label_login)] }, status: :unauthorized
      end
    end

    def user_payload(user)
      {
        id: user.id,
        login: user.login,
        firstname: user.firstname,
        lastname: user.lastname,
        mail: user.mail,
        admin: user.admin?,
        api_key: user.api_key
      }
    end

    # Redmine REST uses format=json for API key auth; Studio JSON endpoints accept the key on any format.
    def authenticate_studio_api_key
      return if User.current.logged?
      return unless Setting.rest_api_enabled?

      if (key = api_key_from_request)
        user = User.find_by_api_key(key)
        User.current = user if user&.active?
      end
    end
  end
end
