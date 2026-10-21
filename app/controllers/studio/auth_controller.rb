# frozen_string_literal: true

module Studio
  class AuthController < BaseController
    skip_before_action :check_if_login_required, :check_password_change, :check_twofa_activation

    def show
      if User.current.logged?
        render json: { user: user_payload(User.current) }
      else
        render json: { user: nil }, status: :unauthorized
      end
    end

    def create
      username = params[:username].to_s.strip
      password = params[:password].to_s
      user = User.try_to_login(username, password)

      if user&.active?
        self.logged_user = user
        render json: { user: user_payload(user) }
      else
        render json: { errors: [l(:notice_account_invalid_credentials)] }, status: :unauthorized
      end
    end

    def destroy
      logout_user if User.current.logged?
      render json: { ok: true }
    end
  end
end
