# frozen_string_literal: true

class ProjectIssueStatus < ApplicationRecord
  belongs_to :project
  belongs_to :issue_status
end
