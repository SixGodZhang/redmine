# frozen_string_literal: true

module Studio
  class SpaController < ApplicationController
    skip_before_action :check_if_login_required
    layout false

    def index
      index_path = Rails.public_path.join('app', 'index.html')
      if index_path.exist?
        render file: index_path, layout: false, content_type: 'text/html'
      else
        render plain: 'Studio frontend 未构建。请在 frontend 目录运行 npm run dev 或 npm run build。', status: :service_unavailable
      end
    end
  end
end
